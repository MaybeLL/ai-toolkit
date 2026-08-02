#!/usr/bin/env node
// goal-optimizer CLI v2 — deterministic core for the task-centric model (spec-v0.2).
// Subcommands: init | list | task | grader | record | retract | grade | assess | explain | next | exam
//
// Design notes (docs/SPEC.md, docs/adr/):
// - Facts (transcripts/, data/trials.jsonl, data/gradings.jsonl) are append-only
//   (INV-1). Corrections are retraction trials, never edits.
// - Tasks and common graders are versioned files; once referenced by a grading
//   they are immutable — revisions are new files (INV-4, ADR-0005).
// - novelty is derived from history at record time (per task family); transcripts
//   are notarized by sha256 at record time and verified on read (INV-3).
// - state/ (health.json, task-index.json) is fully derived (INV-2):
//     rm -rf state/ && node goal.mjs assess  must reproduce byte-identical output.
//   "now" for recency is max(occurred_at) across trials (or --as-of), never wall-clock.
// - state/plan.json is a DECISION artifact written by `next --write`, outside INV-2.
// - No LLM here (INV-5): the CLI validates and computes; agents judge meaning.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// tunable derived-layer parameters (NOT facts; documented in SPEC §5, "拍初值待校准")
// ---------------------------------------------------------------------------
const PARAMS = {
  pass_threshold: 0.7,        // 题级通过:有效 check 折算均值 ≥ 此值(ADR-0006)
  uv_target: 0.6,             // unseen/variant 加权通过率达标线(§5.4)
  min_attempted: 2,           // coverage 达标所需的已尝试题系数(cross-cutting: 单元数)
  stale_days: 60,             // 距最近一次验证超过此天数 → stale(ADR-0004)
  saturation_half_weight: 1.5,
  bands: { weak: 0.4, uneven: 0.65, solid: 0.85 }, // 内部连续分 → 展示档位映射
};
const VERDICT_VALUE = { pass: 1.0, partial: 0.5, fail: 0.0 };
const TRIAL_TYPES = new Set(["mock_interview", "practice", "real_interview"]);
const ORIGINS = new Set(["generated", "imported", "imported-live"]);

// ---------------------------------------------------------------------------
// arg parsing / errors
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// minimal YAML loader — subset used by goal.yaml / tasks/*.yaml / graders/*.yaml:
// nested maps, lists of maps, scalars, comments, flow lists [a, b], block scalars (|)
// ---------------------------------------------------------------------------
function stripComment(line) {
  let inS = false,
    inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD) return line.slice(0, i);
  }
  return line;
}

function loadYaml(text) {
  const blocks = new Map();
  let blockN = 0;
  const rawLines = text.split("\n");
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const noComment = stripComment(rawLines[i]);
    if (noComment.trim() === "") continue;
    const indent = noComment.length - noComment.trimStart().length;
    const trimmed = noComment.trim();
    const bs = trimmed.match(/^((?:- )?[^:]+):\s*\|$/);
    if (bs) {
      // block scalar: capture following RAW lines (comments/blanks preserved)
      const body = [];
      let j = i + 1;
      let bodyIndent = null;
      while (j < rawLines.length) {
        const rl = rawLines[j];
        if (rl.trim() === "") {
          body.push("");
          j++;
          continue;
        }
        const ind = rl.length - rl.trimStart().length;
        if (ind <= indent) break;
        if (bodyIndent === null) bodyIndent = ind;
        body.push(rl.slice(Math.min(bodyIndent, ind)));
        j++;
      }
      while (body.length && body[body.length - 1] === "") body.pop();
      const id = `\u0000B${blockN++}\u0000`;
      blocks.set(id, body.join("\n") + (body.length ? "\n" : ""));
      lines.push({ indent, content: `${bs[1]}: ${id}` });
      i = j - 1;
      continue;
    }
    lines.push({ indent, content: trimmed });
  }

  function scalarPlain(raw) {
    let s = raw.trim();
    if (s === "") return null;
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }
  function scalar(raw) {
    const s = raw.trim();
    if (blocks.has(s)) return blocks.get(s);
    if (s.startsWith("[") && s.endsWith("]")) {
      const inner = s.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map((x) => scalarPlain(x));
    }
    return scalarPlain(s);
  }

  let pos = 0;
  function parseBlock(minIndent) {
    if (pos >= lines.length) return null;
    const first = lines[pos];
    if (first.indent < minIndent) return null;
    if (first.content.startsWith("- ")) return parseList(first.indent);
    return parseMap(first.indent);
  }
  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].content.startsWith("- ")) {
      const { content } = lines[pos];
      const idx = content.indexOf(":");
      if (idx === -1) die(`YAML: expected key: value, got "${content}"`);
      const key = content.slice(0, idx).trim();
      const rest = content.slice(idx + 1).trim();
      pos++;
      if (rest === "") {
        obj[key] = pos < lines.length && lines[pos].indent > indent ? parseBlock(indent + 1) : null;
      } else obj[key] = scalar(rest);
    }
    return obj;
  }
  function parseList(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].content.startsWith("- ")) {
      const afterDash = lines[pos].content.slice(2);
      const idx = afterDash.indexOf(":");
      if (idx === -1) {
        arr.push(scalar(afterDash));
        pos++;
        continue;
      }
      const itemIndent = indent + 2;
      lines[pos] = { indent: itemIndent, content: afterDash };
      arr.push(parseMap(itemIndent));
    }
    return arr;
  }
  return parseBlock(0) ?? {};
}

// ---------------------------------------------------------------------------
// workspace / io helpers
// ---------------------------------------------------------------------------
// goal home resolution (ADR-0010, simplified): data lives in one user-level
// directory — GOAL_OPTIMIZER_HOME, else ~/goal-optimizer/. That's the only
// location knob users ever touch; skills work from any cwd. Resolution affects
// only which directory we read — never any computation (INV-2 safe).
function expandTilde(p) {
  return p.replace(/^~(?=\/|$)/, homedir());
}
function resolveHome() {
  if (process.env.GOAL_OPTIMIZER_HOME) return resolve(expandTilde(process.env.GOAL_OPTIMIZER_HOME));
  return join(homedir(), "goal-optimizer");
}
function listGoalsUnder(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "goal.yaml")))
    .map((d) => d.name)
    .sort();
}
function ws(flags) {
  const root = resolveHome();
  if (existsSync(join(root, "goal.yaml"))) return root; // home itself is a single workspace
  const goals = listGoalsUnder(root);
  if (goals.length === 0)
    die(
      `no goal found under ${root}\n` +
        `Create one first: goal.mjs init --goal-id <id>  (or point GOAL_OPTIMIZER_HOME at your data)`
    );
  const goalId = flags.goal ? String(flags.goal) : goals.length === 1 ? goals[0] : null;
  if (!goalId)
    die(
      `multiple goals under ${root}: ${goals.join(", ")}\n` +
        `Pick one with --goal <id>`
    );
  const wsDir = join(root, goalId);
  if (!existsSync(join(wsDir, "goal.yaml")))
    die(`goal not found: ${goalId} under ${root} (have: ${goals.join(", ")})`);
  return wsDir;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadGoal(wsDir) {
  const p = join(wsDir, "goal.yaml");
  if (!existsSync(p)) die(`goal.yaml not found in ${wsDir}`);
  return loadYaml(readFileSync(p, "utf8"));
}

function topicVocab(goal) {
  const topics = goal.topics || [];
  const map = new Map();
  for (const t of topics) {
    if (!t || !t.id) die("goal.yaml: every topics[] entry needs an id");
    map.set(String(t.id), {
      id: String(t.id),
      weight: t.weight !== undefined ? Number(t.weight) : 0.5,
      critical: Boolean(t.critical),
      cross_cutting: Boolean(t.cross_cutting),
    });
  }
  return map;
}

function round(x, n = 4) {
  return Number(x.toFixed(n));
}

function nextId(items, key, prefix) {
  let max = 0;
  for (const it of items) {
    const m = String(it[key] || "").match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
}

// ref helpers: "coupon-idempotency-v2" → { family: "coupon-idempotency", version: 2 }
function splitRef(ref) {
  const m = String(ref ?? "").match(/^(.+)-v(\d+)$/);
  return m ? { family: m[1], version: parseInt(m[2], 10) } : null;
}

// ---------------------------------------------------------------------------
// library: tasks/*.yaml + graders/*.yaml (versioned, immutable once referenced)
// ---------------------------------------------------------------------------
function loadLibrary(wsDir) {
  const tasks = new Map();
  const graders = new Map();
  for (const [dir, map, key] of [
    ["tasks", tasks, "task"],
    ["graders", graders, "grader"],
  ]) {
    const d = join(wsDir, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      if (!/\.ya?ml$/.test(f)) continue;
      const ref = f.replace(/\.ya?ml$/, "");
      const sr = splitRef(ref);
      if (!sr) die(`${dir}/${f}: filename must be <name>-v<N>.yaml`);
      const doc = loadYaml(readFileSync(join(d, f), "utf8"));
      if (String(doc[key]) !== sr.family) die(`${dir}/${f}: "${key}:" must equal "${sr.family}" (got "${doc[key]}")`);
      if (Number(doc.version) !== sr.version) die(`${dir}/${f}: "version:" must equal ${sr.version} (got ${doc.version})`);
      doc._ref = ref;
      doc._family = sr.family;
      doc._version = sr.version;
      map.set(ref, doc);
    }
  }
  return { tasks, graders };
}

function latestByFamily(map) {
  const out = new Map();
  for (const doc of map.values()) {
    const prev = out.get(doc._family);
    if (!prev || doc._version > prev._version) out.set(doc._family, doc);
  }
  return out;
}

function findCheck(doc, checkId) {
  return (doc.grader?.checks ?? doc.checks ?? []).find((c) => String(c.id) === String(checkId)) ?? null;
}

// ---------------------------------------------------------------------------
// facts: trials.jsonl (+ retractions), gradings.jsonl
// ---------------------------------------------------------------------------
function splitTrials(allTrials) {
  const retracted = new Set(allTrials.filter((t) => t.type === "retraction").map((t) => t.refers_to));
  const active = allTrials.filter((t) => t.type !== "retraction" && !retracted.has(t.trial_id));
  const retractions = allTrials.filter((t) => t.type === "retraction");
  return { active, retractions, retracted };
}

function verifyTranscripts(wsDir, trial) {
  if (!Array.isArray(trial.transcript_sha256)) return;
  trial.transcript.forEach((rel, i) => {
    const expected = trial.transcript_sha256[i];
    if (!expected) return;
    const actual = sha256File(join(wsDir, rel));
    if (actual !== expected) {
      die(
        `transcript hash mismatch for ${trial.trial_id}: ${rel}\n` +
          `  recorded ${expected}\n  actual   ${actual}\n` +
          `The transcript was modified after recording (INV-1 violation). ` +
          `Remedy: goal.mjs retract ${trial.trial_id} --reason "..." and re-record.`
      );
    }
  });
}

// novelty derivation (§4.5): per task family, from prior active trials.
function deriveNovelty(activeTrials, family, variantOf) {
  const prior = activeTrials.filter((t) => splitRef(t.task_ref)?.family === family).length;
  if (prior === 0) {
    if (variantOf && activeTrials.some((t) => splitRef(t.task_ref)?.family === String(variantOf))) return "variant";
    return "unseen";
  }
  return prior === 1 ? "familiar" : "repeat";
}

// Keep only the latest grader version per (trial, family#check); tie → later graded_at,
// then file order (append-only → deterministic).
function effectiveGradings(gradings) {
  const latest = new Map();
  for (const g of gradings) {
    const [ref, checkId] = String(g.grader_ref).split("#");
    const sr = splitRef(ref);
    if (!sr || !checkId) continue;
    const key = `${g.trial_id}|${sr.family}#${checkId}`;
    const prev = latest.get(key);
    if (!prev) {
      latest.set(key, g);
      continue;
    }
    const pv = splitRef(String(prev.grader_ref).split("#")[0]).version;
    if (sr.version > pv || (sr.version === pv && String(g.graded_at ?? "") >= String(prev.graded_at ?? ""))) {
      latest.set(key, g);
    }
  }
  return [...latest.values()];
}

// ---------------------------------------------------------------------------
// §5 estimator (extensional-v0.1) — evidence weights
// ---------------------------------------------------------------------------
function factorDifficulty(taskDoc) {
  return Math.max(0.2, Number(taskDoc?.difficulty ?? 0.5));
}
function factorIndependence(trial) {
  const c = trial.conditions || {};
  if (c.external_materials) return 0.2;
  if (c.hints) return 0.5;
  return 1.0;
}
function factorNovelty(trial) {
  return { unseen: 1.0, variant: 0.8, familiar: 0.5, repeat: 0.25 }[trial.novelty] ?? 0.5;
}
function factorReliability(trial, taskDoc) {
  const base = { real_interview: 1.0, mock_interview: 0.9, practice: 0.7 }[trial.type] ?? 0.5;
  // imported-live graders are written AFTER the performance (not preregistered) —
  // honestly down-weighted (ADR-0003, §5.2).
  const originPenalty = taskDoc?.origin === "imported-live" ? 0.8 : 1.0;
  return base * originPenalty;
}
function daysBetween(fromISO, toISO) {
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86400000;
}
function factorRecency(trial, nowISO) {
  const dd = Math.max(0, daysBetween(trial.occurred_at, nowISO));
  return Math.max(0.3, Math.exp(-dd / 90));
}
function trialWeight(trial, taskDoc, nowISO) {
  return (
    factorDifficulty(taskDoc) *
    factorIndependence(trial) *
    factorNovelty(trial) *
    factorReliability(trial, taskDoc) *
    factorRecency(trial, nowISO)
  );
}
function saturation(W) {
  return 1 - Math.exp(-W / PARAMS.saturation_half_weight);
}
function diversity(uniqueContexts) {
  return 0.5 + 0.5 * (Math.min(uniqueContexts, 4) / 4);
}
function bandOf(score) {
  if (score < PARAMS.bands.weak) return "weak";
  if (score < PARAMS.bands.uneven) return "uneven";
  if (score < PARAMS.bands.solid) return "solid";
  return "strong";
}

// ---------------------------------------------------------------------------
// shared model computation (assess / explain / next all derive from this)
// ---------------------------------------------------------------------------
function computeModel(wsDir, flags = {}) {
  const goal = loadGoal(wsDir);
  const vocab = topicVocab(goal);
  const lib = loadLibrary(wsDir);
  const dataDir = join(wsDir, "data");
  const allTrials = readJsonl(join(dataDir, "trials.jsonl"));
  const { active, retractions, retracted } = splitTrials(allTrials);
  const allGradings = readJsonl(join(dataDir, "gradings.jsonl"));
  const activeGradings = allGradings.filter((g) => !retracted.has(g.trial_id));
  const eff = effectiveGradings(activeGradings);

  let nowISO = flags["as-of"] ? String(flags["as-of"]) : null;
  if (!nowISO) {
    nowISO = allTrials.reduce(
      (acc, t) => (t.occurred_at > acc ? t.occurred_at : acc),
      allTrials[0]?.occurred_at ?? "1970-01-01T00:00:00Z"
    );
  }

  const byTrial = new Map();
  for (const g of eff) {
    if (!byTrial.has(g.trial_id)) byTrial.set(g.trial_id, []);
    byTrial.get(g.trial_id).push(g);
  }

  // evidence units: one per (trial, topic) — the extensional aggregation grain (§5.3)
  const units = [];
  const noEvidenceByTopic = new Map();
  const pendingGrading = [];
  for (const trial of active) {
    const gs = byTrial.get(trial.trial_id) ?? [];
    if (gs.length === 0) {
      pendingGrading.push(trial.trial_id);
      continue;
    }
    const trialFamily = splitRef(trial.task_ref)?.family;
    // difficulty/labels come from the version the trial was actually taken on;
    // must_pass semantics come from the check's own (graded) file version.
    const taskDoc = lib.tasks.get(trial.task_ref) ?? latestByFamily(lib.tasks).get(trialFamily);
    if (!taskDoc) die(`trial ${trial.trial_id}: task ${trial.task_ref} not found in tasks/`);
    const groups = new Map(); // topic → { vals, mustFail, checks }
    for (const g of gs) {
      const [ref, checkId] = String(g.grader_ref).split("#");
      const sr = splitRef(ref);
      let labels;
      let mustPass = false;
      if (sr.family === trialFamily) {
        const gradedDoc = lib.tasks.get(ref);
        if (!gradedDoc) die(`grading ${g.grading_id}: task version ${ref} not found`);
        labels = (taskDoc.labels ?? []).map(String);
        mustPass = Boolean(findCheck(gradedDoc, checkId)?.must_pass);
      } else {
        const graderDoc = lib.graders.get(ref);
        if (!graderDoc) die(`grading ${g.grading_id}: grader_ref ${ref} matches no task family or common grader`);
        labels = [String(graderDoc.label)];
      }
      if (g.verdict === "no-evidence") {
        for (const L of labels) noEvidenceByTopic.set(L, (noEvidenceByTopic.get(L) ?? 0) + 1);
        continue;
      }
      const val = VERDICT_VALUE[g.verdict];
      for (const L of labels) {
        if (!groups.has(L)) groups.set(L, { vals: [], mustFail: false, checks: [] });
        const gr = groups.get(L);
        gr.vals.push(val);
        gr.checks.push(g);
        if (mustPass && g.verdict === "fail") gr.mustFail = true;
      }
    }
    const w = trialWeight(trial, taskDoc, nowISO);
    for (const [topic, gr] of groups) {
      const r = gr.vals.reduce((a, b) => a + b, 0) / gr.vals.length;
      const passed = r >= PARAMS.pass_threshold && !gr.mustFail;
      units.push({
        topic,
        trial,
        family: trialFamily,
        taskDoc,
        r,
        passed,
        mustFail: gr.mustFail,
        w,
        novelty: trial.novelty,
        session: trial.session_id ?? trial.trial_id,
        checks: gr.checks,
      });
    }
  }

  // per-topic health (§5.4, extensional)
  const latestTasks = latestByFamily(lib.tasks);
  const latestGraders = latestByFamily(lib.graders);
  const topics = {};
  for (const id of [...vocab.keys()].sort()) {
    const t = vocab.get(id);
    const tu = units.filter((u) => u.topic === id);
    // suite: task families labeled with this topic (cross-cutting: common grader families)
    const suiteFamilies = t.cross_cutting
      ? [...latestGraders.values()].filter((d) => String(d.label) === id).map((d) => d._family)
      : [...latestTasks.values()].filter((d) => (d.labels ?? []).map(String).includes(id)).map((d) => d._family);
    suiteFamilies.sort();
    const attempted = [...new Set(tu.map((u) => (t.cross_cutting ? u.family : u.family)))].sort();
    const coverageOk = t.cross_cutting ? tu.length >= PARAMS.min_attempted : attempted.length >= PARAMS.min_attempted;

    const sumW = tu.reduce((a, u) => a + u.w, 0);
    const scoreInternal = sumW > 0 ? tu.reduce((a, u) => a + u.w * u.r, 0) / sumW : 0;
    const families = new Set(tu.map((u) => u.family));
    const sessions = new Set(tu.map((u) => u.session));
    const confidence = tu.length === 0 ? 0 : round(saturation(sumW) * diversity(Math.min(families.size, sessions.size)));

    const byNovelty = {};
    for (const u of tu) {
      if (!byNovelty[u.novelty]) byNovelty[u.novelty] = { trials: 0, passed: 0 };
      byNovelty[u.novelty].trials++;
      if (u.passed) byNovelty[u.novelty].passed++;
    }
    const uv = tu.filter((u) => u.novelty === "unseen" || u.novelty === "variant");
    const uvW = uv.reduce((a, u) => a + u.w, 0);
    const uvRate = uvW > 0 ? uv.reduce((a, u) => a + u.w * (u.passed ? 1 : 0), 0) / uvW : 0;
    const uvOk = uv.length > 0 && uvRate >= PARAMS.uv_target;

    // must_pass failures unresolved unless a later unit on the same family passed
    const mustPassFailures = tu
      .filter((u) => u.mustFail)
      .filter((u) => !tu.some((v) => v.family === u.family && v.passed && v.trial.occurred_at > u.trial.occurred_at))
      .map((u) => `${u.trial.task_ref} @ ${u.trial.trial_id}`)
      .sort();

    const lastVerified = tu.length > 0 ? tu.map((u) => u.trial.occurred_at).sort().at(-1) : null;
    const hadPassedUv = uv.some((u) => u.passed);
    const stale = Boolean(lastVerified && hadPassedUv && daysBetween(lastVerified, nowISO) > PARAMS.stale_days);

    let deficit = uv.length === 0 ? 1 : Math.min(1, Math.max(0, 1 - uvRate));
    if (mustPassFailures.length > 0) deficit = Math.max(deficit, 0.6);
    if (!coverageOk) deficit = Math.max(deficit, 0.4);
    if (stale) deficit = Math.max(deficit, 0.3);
    deficit = round(deficit);

    const healthy = coverageOk && uvOk && mustPassFailures.length === 0 && !stale;
    const priority = round(t.weight * deficit * (0.5 + 0.5 * confidence));
    topics[id] = {
      band: tu.length === 0 ? null : bandOf(scoreInternal),
      confidence,
      weight: t.weight,
      critical: t.critical,
      cross_cutting: t.cross_cutting,
      healthy,
      deficit,
      priority,
      mode: confidence < 0.4 ? "diagnose" : "train",
      stale,
      last_verified: lastVerified ? lastVerified.slice(0, 10) : null,
      coverage: { suite: suiteFamilies, attempted, coverage_ok: coverageOk },
      by_novelty: byNovelty,
      must_pass_failures: mustPassFailures,
      no_evidence_checks: noEvidenceByTopic.get(id) ?? 0,
      _internal: { score: scoreInternal, sumW, uvRate, families: families.size, sessions: sessions.size, units: tu },
    };
  }

  return {
    goal,
    vocab,
    lib,
    latestTasks,
    latestGraders,
    nowISO,
    active,
    retractions,
    allTrials,
    units,
    topics,
    pendingGrading: pendingGrading.sort(),
  };
}

function stripInternal(topics) {
  const out = {};
  for (const id of Object.keys(topics)) {
    const { _internal, ...pub } = topics[id];
    out[id] = pub;
  }
  return out;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
function goalTemplate(goalId, title, createdAt) {
  return `# goal.yaml — 定标(M1):topics = 优先级声明 + label 权威词表(ADR-0005)
# 没有数值分数线:达标是外延式的(该 topic 下 unseen/variant 题的通过情况,SPEC §5.4)。
# task 与 common grader 的 label 必须出自本清单;要用新词,先加在这里(git commit)。
goal_id: ${goalId}
title: ${title}
created_at: ${createdAt}
target_date:            # 可选,YYYY-MM-DD

topics:
  # 占位示例,请替换成你的真实 topic:
  - id: example-topic
    weight: 0.9              # 相对重要度(排序用,不装测量)
    critical: true           # 门槛项:不健康则目标整体不达标
  - id: communication
    weight: 0.5
    cross_cutting: true      # 横切行为:由 common grader 产生证据,不做题目内容
`;
}

function commonGraderTemplate() {
  return `# graders/communication-v1.yaml — common grader(横切行为,跨题复用,ADR-0005)
# 一经有 grading 引用即不可变;修订开新版本文件(communication-v2.yaml)。
grader: communication
version: 1
label: communication          # 判定聚合到该 topic(必须在 goal.yaml topics 里)
applies_to: [mock_interview, real_interview]
checks:
  - id: m1
    text: 先给结构(要点框架)再展开细节
  - id: m2
    text: 主动澄清模糊需求而非直接假设
  - id: m3
    text: tradeoff 明示(说出放弃了什么),而非暗含
`;
}

function cmdInit(positional, flags) {
  // ADR-0010: workspaces always live at <goal home>/<goal-id>.
  const goalId = flags["goal-id"] ? String(flags["goal-id"]) : positional[0] ? String(positional[0]) : null;
  if (!goalId) die("usage: init --goal-id <id> [--title <t>] [--created-at <YYYY-MM-DD>]");
  const abs = join(resolveHome(), goalId);
  const title = flags.title ? String(flags.title) : goalId;
  const createdAt = flags["created-at"] ? String(flags["created-at"]) : new Date().toISOString().slice(0, 10);

  const goalPath = join(abs, "goal.yaml");
  if (existsSync(goalPath)) die(`refusing to overwrite existing workspace: ${goalPath} already exists`);

  mkdirSync(join(abs, "tasks"), { recursive: true });
  mkdirSync(join(abs, "graders"), { recursive: true });
  mkdirSync(join(abs, "transcripts"), { recursive: true });
  mkdirSync(join(abs, "data"), { recursive: true });
  writeFileSync(join(abs, "tasks", ".gitkeep"), "");
  writeFileSync(join(abs, "transcripts", ".gitkeep"), "");
  writeFileSync(join(abs, "graders", "communication-v1.yaml"), commonGraderTemplate());
  writeFileSync(goalPath, goalTemplate(goalId, title, createdAt));

  process.stdout.write(
    `initialized workspace at ${abs}\n` +
      `  goal.yaml                      填写真实 topics(weight/critical/cross_cutting)\n` +
      `  graders/communication-v1.yaml  横切 common grader 模板,按需修改后生效\n` +
      `  tasks/                         题库(task add 入库)\n` +
      `  transcripts/                   逐字稿(record 时引用)\n` +
      `  (data/ state/ 由 record/assess 自动创建)\n` +
      (existsSync(join(abs, "..", ".git")) || existsSync(join(abs, ".git"))
        ? ""
        : `tip: 建议在 goal home 跑 git init + 私有远端——异地备份 + 跨设备同步(state/ 可 gitignore)\n`) +
      `next: 与 Agent(goal-define)起草 topics → task-forge 制题 → goal-drill 施测。\n`
  );
}

// ---------------------------------------------------------------------------
// task add / grader add / task show
// ---------------------------------------------------------------------------
function validateChecks(checks, where) {
  if (!Array.isArray(checks) || checks.length === 0) die(`${where}: grader checks must be a non-empty list`);
  const ids = new Set();
  for (const c of checks) {
    if (!c.id) die(`${where}: every check needs an id`);
    if (!c.text || typeof c.text !== "string") die(`${where}: check ${c.id} needs text`);
    if (ids.has(String(c.id))) die(`${where}: duplicate check id ${c.id}`);
    ids.add(String(c.id));
  }
}

function cmdTaskAdd(flags) {
  const wsDir = ws(flags);
  const src = flags.file ? readFileSync(resolve(String(flags.file)), "utf8") : readFileSync(0, "utf8");
  const doc = loadYaml(src);
  const goal = loadGoal(wsDir);
  const vocab = topicVocab(goal);

  const isGrader = doc.grader !== undefined && typeof doc.grader === "string";
  if (isGrader) {
    // common grader
    if (!doc.grader || !Number.isInteger(Number(doc.version))) die("grader file needs grader: <name> and version: <int>");
    const ref = `${doc.grader}-v${doc.version}`;
    if (!doc.label || !vocab.has(String(doc.label))) die(`grader label "${doc.label}" not in goal.yaml topics vocabulary`);
    validateChecks(doc.checks, ref);
    if (doc.applies_to !== undefined && !Array.isArray(doc.applies_to)) die("applies_to must be a flow list, e.g. [mock_interview]");
    const dest = join(wsDir, "graders", `${ref}.yaml`);
    if (existsSync(dest)) die(`refusing to overwrite ${dest} (revisions are new versions, INV-4)`);
    if (Number(doc.version) > 1 && !existsSync(join(wsDir, "graders", `${doc.grader}-v${Number(doc.version) - 1}.yaml`)))
      die(`version ${doc.version} requires ${doc.grader}-v${Number(doc.version) - 1} to exist (versions are contiguous)`);
    mkdirSync(join(wsDir, "graders"), { recursive: true });
    writeFileSync(dest, src.endsWith("\n") ? src : src + "\n");
    process.stdout.write(`${ref} installed to graders/\n`);
    return;
  }

  if (!doc.task || !Number.isInteger(Number(doc.version))) die("task file needs task: <name> and version: <int>");
  const ref = `${doc.task}-v${doc.version}`;
  if (!ORIGINS.has(String(doc.origin))) die(`origin must be one of generated|imported|imported-live (got "${doc.origin}")`);
  if (!Array.isArray(doc.labels) || doc.labels.length === 0) die("labels must be a non-empty flow list");
  for (const L of doc.labels) {
    if (!vocab.has(String(L))) die(`label "${L}" not in goal.yaml topics vocabulary — add it to topics first (ADR-0005)`);
    if (vocab.get(String(L)).cross_cutting) die(`label "${L}" is cross_cutting — it belongs to common graders, not task labels`);
  }
  if (doc.difficulty === undefined || Number(doc.difficulty) < 0 || Number(doc.difficulty) > 1)
    die("difficulty (0-1) is required — it is a property of the task, fixed once (SPEC §4.2)");
  if (!doc.prompt || typeof doc.prompt !== "string" || doc.prompt.trim() === "") die("prompt (block scalar) is required");
  validateChecks(doc.grader?.checks, ref);
  if (doc.variant_of !== undefined && typeof doc.variant_of !== "string") die("variant_of must be a task family name");
  if (!doc.reference_solution || String(doc.reference_solution).trim() === "")
    process.stderr.write(`warning: ${ref} has no reference_solution — forge QA (grade the reference, expect all-pass) is skipped\n`);

  const dest = join(wsDir, "tasks", `${ref}.yaml`);
  if (existsSync(dest)) die(`refusing to overwrite ${dest} (revisions are new versions, INV-4)`);
  if (Number(doc.version) > 1 && !existsSync(join(wsDir, "tasks", `${doc.task}-v${Number(doc.version) - 1}.yaml`)))
    die(`version ${doc.version} requires ${doc.task}-v${Number(doc.version) - 1} to exist (versions are contiguous)`);
  mkdirSync(join(wsDir, "tasks"), { recursive: true });
  writeFileSync(dest, src.endsWith("\n") ? src : src + "\n");
  process.stdout.write(`${ref} installed to tasks/\n`);
}

function resolveTaskRef(lib, refOrFamily) {
  if (lib.tasks.has(refOrFamily)) return lib.tasks.get(refOrFamily);
  const latest = latestByFamily(lib.tasks).get(refOrFamily);
  if (latest) return latest;
  die(`task not found: ${refOrFamily}`);
}

function cmdTaskShow(positional, flags) {
  const wsDir = ws(flags);
  const refArg = positional[0];
  if (!refArg) die("usage: task show <ref|family> [--prompt-only]");
  const lib = loadLibrary(wsDir);
  const doc = resolveTaskRef(lib, refArg);
  if (flags["prompt-only"]) {
    // Drill discipline (§7): the interviewer must never see grader checks —
    // seeing them steers the interview toward the checkpoints (teaching-to-test).
    const out = {
      task_ref: doc._ref,
      labels: doc.labels,
      difficulty: doc.difficulty,
      prompt: doc.prompt,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  process.stdout.write(readFileSync(join(wsDir, "tasks", `${doc._ref}.yaml`), "utf8"));
}

// ---------------------------------------------------------------------------
// record / retract
// ---------------------------------------------------------------------------
function cmdRecord(flags) {
  const wsDir = ws(flags);
  const dataDir = join(wsDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const trials = readJsonl(join(dataDir, "trials.jsonl"));
  const { active } = splitTrials(trials);
  const lib = loadLibrary(wsDir);

  const taskRefArg = flags.task;
  if (!taskRefArg) die("--task <task_ref> is required (record anchors every trial to a task, ADR-0003)");
  const taskDoc = lib.tasks.get(String(taskRefArg));
  if (!taskDoc) die(`task not found: ${taskRefArg} (install it first via task add)`);

  if (!flags.type || !TRIAL_TYPES.has(String(flags.type)))
    die(`--type must be one of ${[...TRIAL_TYPES].join("|")}`);
  if (!flags["occurred-at"]) die("--occurred-at <ISO8601> is required");
  if (flags.novelty) die("--novelty is not accepted: novelty is derived from history (§4.5)");
  if (flags.difficulty) die("--difficulty is not accepted: difficulty is a property of the task (§4.2)");
  const transcript = flags.transcript;
  if (!transcript) die("--transcript <path relative to workspace> is required");
  const trAbs = join(wsDir, String(transcript));
  if (!existsSync(trAbs)) die(`transcript not found: ${trAbs}`);

  const trial = {
    schema: "trial-v1",
    trial_id: nextId(trials, "trial_id", "trl_"),
    task_ref: taskDoc._ref,
    type: String(flags.type),
    occurred_at: String(flags["occurred-at"]),
    ...(flags.session ? { session_id: String(flags.session) } : {}),
    novelty: deriveNovelty(active, taskDoc._family, taskDoc.variant_of),
    ...(flags.duration !== undefined ? { duration_minutes: Number(flags.duration) } : {}),
    conditions: {
      time_limit: flags["time-limit"] === true || flags["time-limit"] === "true",
      hints: flags.hints === true || flags.hints === "true",
      external_materials: flags.materials === true || flags.materials === "true",
      evaluator: String(flags.evaluator ?? "agent"),
    },
    transcript: [String(transcript)],
    transcript_sha256: [sha256File(trAbs)],
  };
  appendFileSync(join(dataDir, "trials.jsonl"), JSON.stringify(trial) + "\n");
  process.stdout.write(`${trial.trial_id} (novelty=${trial.novelty})\n`);
}

function cmdRetract(positional, flags) {
  const wsDir = ws(flags);
  const trialId = positional[0];
  if (!trialId) die("usage: retract <trial_id> --reason <text> --occurred-at <ISO>");
  if (!flags.reason) die("--reason <text> is required");
  if (!flags["occurred-at"]) die("--occurred-at <ISO8601> is required");
  const dataDir = join(wsDir, "data");
  const trials = readJsonl(join(dataDir, "trials.jsonl"));
  const target = trials.find((t) => t.trial_id === trialId);
  if (!target) die(`trial not found: ${trialId}`);
  if (target.type === "retraction") die("cannot retract a retraction");
  const { retracted } = splitTrials(trials);
  if (retracted.has(trialId)) die(`trial already retracted: ${trialId}`);

  const r = {
    schema: "trial-v1",
    trial_id: nextId(trials, "trial_id", "trl_"),
    type: "retraction",
    occurred_at: String(flags["occurred-at"]),
    refers_to: trialId,
    reason: String(flags.reason),
  };
  appendFileSync(join(dataDir, "trials.jsonl"), JSON.stringify(r) + "\n");
  process.stdout.write(`${r.trial_id} (retracts ${trialId}; its gradings are now excluded)\n`);
}

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------
function cmdGrade(positional, flags) {
  const wsDir = ws(flags);
  const trialId = positional[0];
  if (!trialId) die("usage: grade <trial_id> [--write]");
  const dataDir = join(wsDir, "data");
  const trials = readJsonl(join(dataDir, "trials.jsonl"));
  const trial = trials.find((t) => t.trial_id === trialId);
  if (!trial) die(`trial not found: ${trialId}`);
  if (trial.type === "retraction") die(`${trialId} is a retraction; nothing to grade`);
  const { retracted } = splitTrials(trials);
  if (retracted.has(trialId)) die(`trial ${trialId} has been retracted; re-record before grading`);
  verifyTranscripts(wsDir, trial);

  const lib = loadLibrary(wsDir);
  const family = splitRef(trial.task_ref)?.family;
  // Grade against the LATEST version of the task family (regrade-after-revision,
  // §4.7); the grader_ref in each grading records exactly which version judged it.
  const taskDoc = latestByFamily(lib.tasks).get(family);
  if (!taskDoc) die(`task family not found for trial: ${trial.task_ref}`);
  const commonGraders = [...latestByFamily(lib.graders).values()]
    .filter((g) => !Array.isArray(g.applies_to) || g.applies_to.map(String).includes(trial.type))
    .sort((a, b) => a._ref.localeCompare(b._ref));

  if (!flags.write) {
    // PRINT MODE for the grading agent (fresh context, §7): transcript + graders.
    // No prior conclusions, no state/ — anti-anchoring by construction.
    const out = {
      trial,
      task: { task_ref: taskDoc._ref, labels: taskDoc.labels, prompt: taskDoc.prompt, grader: taskDoc.grader },
      common_graders: commonGraders.map((g) => ({ grader_ref: g._ref, label: g.label, checks: g.checks })),
      transcripts: trial.transcript.map((rel) => ({ path: rel, content: readFileSync(join(wsDir, rel), "utf8") })),
      verdicts: ["pass", "partial", "fail", "no-evidence"],
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }

  // WRITE MODE: gradings JSON (array or single) from stdin; validate; append.
  const stdin = readFileSync(0, "utf8");
  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (e) {
    die(`invalid JSON on stdin: ${e.message}`);
  }
  const drafts = Array.isArray(payload) ? payload : [payload];
  const gradingsPath = join(dataDir, "gradings.jsonl");
  const existing = readJsonl(gradingsPath);
  const toAppend = [];
  for (const d of drafts) {
    const refStr = String(d.grader_ref ?? "");
    const [ref, checkId] = refStr.split("#");
    if (!ref || !checkId) die(`grader_ref must be "<ref>#<check_id>", got ${JSON.stringify(d.grader_ref)}`);
    const sr = splitRef(ref);
    if (!sr) die(`grader_ref ${refStr}: "${ref}" is not a versioned ref`);
    let doc;
    if (sr.family === family) {
      doc = lib.tasks.get(ref);
      if (!doc) die(`grader_ref ${refStr}: task version ${ref} not found`);
    } else {
      doc = lib.graders.get(ref);
      if (!doc) die(`grader_ref ${refStr}: not this trial's task family (${family}) and no such common grader`);
      if (Array.isArray(doc.applies_to) && !doc.applies_to.map(String).includes(trial.type))
        die(`grader_ref ${refStr}: common grader does not apply to trial type ${trial.type}`);
    }
    if (!findCheck(doc, checkId)) die(`grader_ref ${refStr}: check "${checkId}" not found in ${ref}`);
    if (!(d.verdict in VERDICT_VALUE) && d.verdict !== "no-evidence")
      die(`verdict must be pass|partial|fail|no-evidence, got ${JSON.stringify(d.verdict)}`);

    if (d.verdict !== "no-evidence") {
      if (!d.evidence || typeof d.evidence !== "string") die(`${refStr}: evidence (string) is required unless no-evidence`);
      // INV-3: citation must point at a real, non-empty span inside this trial's transcript.
      const tref = String(d.transcript_ref ?? "");
      const rm = tref.match(/^(.*)#L(\d+)(?:-L(\d+))?$/);
      if (!rm) die(`transcript_ref must be "<path>#L<n>" or "<path>#L<n>-L<m>", got ${JSON.stringify(d.transcript_ref)}`);
      const [, refPath, s, e] = rm;
      const start = parseInt(s, 10);
      const end = e ? parseInt(e, 10) : start;
      if (!trial.transcript.includes(refPath))
        die(`transcript_ref path "${refPath}" is not one of ${trialId}'s transcripts: ${trial.transcript.join(", ")}`);
      if (end < start) die(`transcript_ref range end < start: ${tref}`);
      const refLines = readFileSync(join(wsDir, refPath), "utf8").split("\n");
      if (start < 1 || end > refLines.length)
        die(`transcript_ref lines ${start}-${end} out of range (file has ${refLines.length} lines): ${tref}`);
      if (refLines.slice(start - 1, end).join("\n").trim() === "")
        die(`transcript_ref ${tref} points at blank lines; cite the lines that contain the evidence`);
    }

    toAppend.push({
      schema: "grading-v1",
      grading_id: nextId([...existing, ...toAppend], "grading_id", "grd_"),
      trial_id: trialId,
      grader_ref: refStr,
      verdict: d.verdict,
      ...(d.verdict !== "no-evidence" ? { evidence: d.evidence, transcript_ref: d.transcript_ref } : {}),
      grader_model: d.grader_model ?? "unknown",
      prompt_version: d.prompt_version ?? "grade-v0.1",
      graded_at: d.graded_at ?? (flags["graded-at"] ? String(flags["graded-at"]) : trial.occurred_at),
    });
  }
  for (const g of toAppend) appendFileSync(gradingsPath, JSON.stringify(g) + "\n");
  process.stdout.write(toAppend.map((g) => g.grading_id).join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// assess
// ---------------------------------------------------------------------------
function cmdAssess(flags) {
  const wsDir = ws(flags);
  const m = computeModel(wsDir, flags);

  const health = {
    estimator_version: "extensional-v0.1",
    as_of: m.nowISO,
    params: PARAMS,
    topics: stripInternal(m.topics),
  };

  // task-index: suite view + pending work + coverage blind spots (ADR-0002: derived, no state machine)
  const suiteView = {};
  const attemptedByFamily = new Map();
  for (const t of m.active) {
    const fam = splitRef(t.task_ref)?.family;
    attemptedByFamily.set(fam, (attemptedByFamily.get(fam) ?? 0) + 1);
  }
  for (const id of Object.keys(m.topics)) {
    const cov = m.topics[id].coverage;
    suiteView[id] = {
      suite: cov.suite.map((fam) => {
        const latest = m.latestTasks.get(fam) ?? m.latestGraders.get(fam);
        return { family: fam, latest: latest?._ref ?? null, trials: attemptedByFamily.get(fam) ?? 0 };
      }),
      no_evidence_checks: m.topics[id].no_evidence_checks,
    };
  }
  const coverageGaps = Object.keys(m.topics).filter(
    (id) => !m.topics[id].cross_cutting && m.topics[id].coverage.suite.length === 0
  );
  const index = {
    as_of: m.nowISO,
    pending_grading: m.pendingGrading,
    coverage_gaps: coverageGaps,
    topics: suiteView,
  };

  const stateDir = join(wsDir, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "health.json"), JSON.stringify(health, null, 2) + "\n");
  writeFileSync(join(stateDir, "task-index.json"), JSON.stringify(index, null, 2) + "\n");
  const nTopics = Object.keys(m.topics).length;
  let msg = `assessed ${nTopics} topic(s) from ${m.units.length} evidence unit(s); state written (as_of=${m.nowISO})\n`;
  if (m.pendingGrading.length > 0)
    msg += `⚠ ${m.pendingGrading.length} trial(s) await grading: ${m.pendingGrading.join(", ")}\n`;
  if (coverageGaps.length > 0) msg += `⚠ topics with no tasks in the bank: ${coverageGaps.join(", ")} (forge needed)\n`;
  process.stdout.write(msg);
}

// ---------------------------------------------------------------------------
// explain
// ---------------------------------------------------------------------------
function cmdExplain(positional, flags) {
  const wsDir = ws(flags);
  const topicId = positional[0];
  if (!topicId) die("usage: explain <topic>");
  const m = computeModel(wsDir, flags);
  const t = m.topics[topicId];
  if (!t) die(`topic not in goal.yaml vocabulary: ${topicId}`);
  for (const u of t._internal.units) verifyTranscripts(wsDir, u.trial);

  const L = [];
  L.push(`topic  ${topicId}${t.critical ? "  (critical)" : ""}${t.cross_cutting ? "  (cross-cutting)" : ""}`);
  L.push(
    `状态   band ${t.band ?? "—"}   confidence ${t.confidence}   ${t.healthy ? "✓ healthy" : `✗ deficit ${t.deficit}`}   mode ${t.mode}${t.stale ? "   ⚠ stale(距上次验证已久)" : ""}`
  );
  L.push(`覆盖   题库 ${t.coverage.suite.length} 题系,已尝试 ${t.coverage.attempted.length}${t.coverage.coverage_ok ? "" : "(覆盖不足)"};最近验证 ${t.last_verified ?? "从未"}`);
  const nv = t.by_novelty;
  const nvLine = ["unseen", "variant", "familiar", "repeat"]
    .filter((k) => nv[k])
    .map((k) => `${k} ${nv[k].passed}/${nv[k].trials} 过`)
    .join(",  ");
  L.push(`分层   ${nvLine || "(无已打分 trial)"}   ← dimension 轴的继承人(ADR-0005)`);
  if (t.must_pass_failures.length > 0) L.push(`门槛   未解决的 must_pass 失败: ${t.must_pass_failures.join("; ")}`);
  L.push("");
  L.push("证据(按权重排序):");
  const units = [...t._internal.units].sort((a, b) => b.w - a.w);
  for (const u of units) {
    const dd = Math.max(0, daysBetween(u.trial.occurred_at, m.nowISO)).toFixed(0);
    L.push(
      `  • ${u.trial.occurred_at.slice(0, 10)}  [${u.trial.type}/${u.novelty}]  ${u.trial.task_ref}  r=${round(u.r, 2)}  ${u.passed ? "✓过" : "✗未过"}${u.mustFail ? "(must_pass fail)" : ""}  w=${round(u.w, 3)}`
    );
    L.push(
      `      w = difficulty ${round(factorDifficulty(u.taskDoc), 2)} × independence ${round(factorIndependence(u.trial), 2)} × novelty ${round(factorNovelty(u.trial), 2)} × reliability ${round(factorReliability(u.trial, u.taskDoc), 2)} × recency ${round(factorRecency(u.trial, m.nowISO), 2)}  (${dd}d ago)`
    );
    for (const g of u.checks) {
      const [ref, checkId] = String(g.grader_ref).split("#");
      const doc = m.lib.tasks.get(ref) ?? m.lib.graders.get(ref);
      const check = doc ? findCheck(doc, checkId) : null;
      L.push(`      [${g.verdict}] ${check?.text ?? g.grader_ref}${check?.must_pass ? " (must_pass)" : ""}`);
      if (g.evidence) L.push(`        “${g.evidence}”  → ${g.transcript_ref}`);
    }
  }
  // growth curve per task family (trial sequence = 成长曲线切片, §4.4)
  const fams = [...new Set(units.map((u) => u.family))].sort();
  const curves = fams
    .map((f) => {
      const seq = units
        .filter((u) => u.family === f)
        .sort((a, b) => a.trial.occurred_at.localeCompare(b.trial.occurred_at))
        .map((u) => `${round(u.r, 2)}@${u.trial.occurred_at.slice(5, 10)}`);
      return seq.length > 1 ? `  ${f}: ${seq.join(" → ")}` : null;
    })
    .filter(Boolean);
  if (curves.length > 0) {
    L.push("");
    L.push("成长曲线(同题系多次尝试):");
    L.push(...curves);
  }
  L.push("");
  L.push("置信度为何不是更高?");
  L.push(`  • 有效证据量 Σw = ${round(t._internal.sumW, 3)} → saturation = ${round(saturation(t._internal.sumW), 3)}`);
  L.push(
    `  • 场景多样性 = min(${t._internal.families} 题系, ${t._internal.sessions} 场次) → diversity = ${round(diversity(Math.min(t._internal.families, t._internal.sessions)), 3)}`
  );
  L.push(`  • confidence = saturation × diversity = ${t.confidence}`);
  if (t.mode === "diagnose") L.push(`  ⚠ confidence < 0.4:先做题探明水平(diagnose),而非直接训练。`);
  if (t.no_evidence_checks > 0)
    L.push(`  • ${t.no_evidence_checks} 条 check 无证据(no-evidence)——题未引出考点或跑题的信号,不计入分数。`);

  const retractedHere = m.retractions.filter((r) =>
    m.allTrials.some((tr) => tr.trial_id === r.refers_to)
  );
  if (retractedHere.length > 0) {
    L.push("");
    L.push("撤销记录(其判定已排除):");
    for (const r of retractedHere) L.push(`  • ${r.occurred_at.slice(0, 10)}  ${r.refers_to} 被撤销:${r.reason ?? ""}`);
  }
  process.stdout.write(L.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// next — deterministic task picker (M6). plan.json is a decision artifact.
// ---------------------------------------------------------------------------
function cmdNext(flags) {
  const wsDir = ws(flags);
  const m = computeModel(wsDir, flags);

  if (!flags.write) {
    const top = Number(flags.top ?? 3);
    const ranked = Object.keys(m.topics)
      .filter((id) => !m.topics[id].healthy)
      .sort((a, b) => {
        const A = m.topics[a],
          B = m.topics[b];
        if (A.critical !== B.critical) return A.critical ? -1 : 1;
        if (B.priority !== A.priority) return B.priority - A.priority;
        return a.localeCompare(b);
      })
      .slice(0, top)
      .map((id) => {
        const t = m.topics[id];
        const attempted = new Set(t.coverage.attempted);
        const candidates = t.cross_cutting
          ? [] // cross-cutting topics ride along any task; no dedicated candidates
          : t.coverage.suite
              .filter((fam) => !attempted.has(fam))
              .map((fam) => {
                const doc = m.latestTasks.get(fam);
                const wouldBe =
                  doc?.variant_of && attempted.has(String(doc.variant_of)) ? "variant" : "unseen";
                return { task_ref: doc?._ref, would_be_novelty: wouldBe };
              });
        return {
          topic: id,
          priority: t.priority,
          mode: t.mode,
          deficit: t.deficit,
          critical: t.critical,
          cross_cutting: t.cross_cutting,
          stale: t.stale,
          candidates,
          forge_needed: !t.cross_cutting && candidates.length === 0,
        };
      });
    process.stdout.write(JSON.stringify({ top, as_of: m.nowISO, topics: ranked }, null, 2) + "\n");
    return;
  }

  // WRITE MODE: agent-designed actions from stdin (≤3), CLI validates.
  const stdin = readFileSync(0, "utf8");
  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (e) {
    die(`invalid JSON on stdin: ${e.message}`);
  }
  const actions = Array.isArray(payload) ? payload : [payload];
  if (actions.length < 1) die("plan must contain at least one action");
  if (actions.length > 3) die(`next designs at most 3 focused actions (got ${actions.length})`);
  const out = [];
  actions.forEach((a, i) => {
    if (!a.topic || !m.vocab.has(String(a.topic))) die(`action ${i + 1}: topic must be in goal.yaml vocabulary`);
    if (!a.reason || typeof a.reason !== "string") die(`action ${i + 1}: reason (string) is required`);
    const forge = Boolean(a.forge_needed);
    if (!forge) {
      if (!a.task_ref) die(`action ${i + 1}: task_ref is required (or set forge_needed: true)`);
      const sr = splitRef(String(a.task_ref));
      if (!sr || !m.lib.tasks.has(String(a.task_ref))) die(`action ${i + 1}: task_ref ${a.task_ref} not found in tasks/`);
    }
    // No ΔCapability / expected-gain fields accepted: rank, don't fabricate deltas (§4.10).
    out.push({
      rank: i + 1,
      topic: String(a.topic),
      ...(forge ? { forge_needed: true } : { task_ref: String(a.task_ref) }),
      reason: a.reason,
    });
  });
  const planDoc = {
    generated_at: flags["generated-at"] ? String(flags["generated-at"]) : new Date().toISOString(),
    against: "health.json",
    actions: out,
  };
  const stateDir = join(wsDir, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "plan.json"), JSON.stringify(planDoc, null, 2) + "\n");
  process.stdout.write(`wrote ${out.length} action(s) to state/plan.json\n`);
}

// ---------------------------------------------------------------------------
// exam — deterministic mock-exam composer (ADR-0009). Read-only, no LLM.
// next answers "what single thing to practice"; exam answers "what a full
// weighted-coverage mock should contain".
// ---------------------------------------------------------------------------
function cmdExam(flags) {
  const wsDir = ws(flags);
  const m = computeModel(wsDir, flags);
  const size = Number(flags.size ?? 4);

  const attemptCount = new Map(); // family → active trial count
  for (const t of m.active) {
    const fam = splitRef(t.task_ref)?.family;
    attemptCount.set(fam, (attemptCount.get(fam) ?? 0) + 1);
  }

  // 1. content topics by weight desc (tie: id)
  const topicIds = [...m.vocab.values()]
    .filter((t) => !t.cross_cutting)
    .sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : a.id.localeCompare(b.id)))
    .map((t) => t.id);

  // 2. per-topic candidate queues: unattempted families first (unseen/variant),
  //    fallback = least-attempted; deterministic name tiebreak.
  const queues = new Map();
  const forgeNeeded = [];
  for (const id of topicIds) {
    const suite = m.topics[id].coverage.suite; // sorted family names
    if (suite.length === 0) {
      forgeNeeded.push(id);
      queues.set(id, []);
      continue;
    }
    const unattempted = suite.filter((f) => !(attemptCount.get(f) > 0)).sort();
    const fallback = suite
      .filter((f) => attemptCount.get(f) > 0)
      .sort((a, b) => (attemptCount.get(a) !== attemptCount.get(b) ? attemptCount.get(a) - attemptCount.get(b) : a.localeCompare(b)));
    queues.set(id, [...unattempted, ...fallback]);
  }

  // 3. round-robin across topics, dedupe families (a task may carry 2 labels)
  const paper = [];
  const used = new Set();
  let progressed = true;
  while (paper.length < size && progressed) {
    progressed = false;
    for (const id of topicIds) {
      if (paper.length >= size) break;
      const q = queues.get(id);
      while (q.length > 0) {
        const fam = q.shift();
        if (used.has(fam)) continue;
        used.add(fam);
        const doc = m.latestTasks.get(fam);
        const attempted = attemptCount.get(fam) > 0;
        const wouldBe = attempted
          ? "familiar/repeat"
          : doc?.variant_of && attemptCount.get(String(doc.variant_of)) > 0
            ? "variant"
            : "unseen";
        paper.push({ seq: paper.length + 1, task_ref: doc._ref, topic: id, difficulty: doc.difficulty, would_be_novelty: wouldBe });
        progressed = true;
        break;
      }
    }
  }

  const out = {
    as_of: m.nowISO,
    size_requested: size,
    session_id: `ses-exam-${m.nowISO.slice(0, 10)}`,
    paper,
    ...(forgeNeeded.length > 0 ? { forge_needed: forgeNeeded } : {}),
    ...(paper.length < size ? { note: `task bank exhausted at ${paper.length} task(s); forge more to fill the paper` } : {}),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// list — cross-goal read-only overview (M1). Never triggers assess.
// ---------------------------------------------------------------------------
function summarizeGoal(wsDir) {
  const goal = loadGoal(wsDir);
  const base = {
    goal_id: goal.goal_id ?? basename(wsDir),
    title: goal.title ?? goal.goal_id ?? basename(wsDir),
    workspace: wsDir,
    target_date: goal.target_date ?? null,
    topics: (goal.topics || []).length,
  };
  const healthPath = join(wsDir, "state", "health.json");
  if (!existsSync(healthPath)) {
    return { ...base, assessed: false, as_of: null, unhealthy: 0, critical_unhealthy: 0, top: null, pending_grading: 0 };
  }
  const health = JSON.parse(readFileSync(healthPath, "utf8"));
  const indexPath = join(wsDir, "state", "task-index.json");
  const pending = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")).pending_grading ?? []).length : 0;
  const entries = Object.entries(health.topics ?? {});
  const unhealthy = entries.filter(([, t]) => !t.healthy);
  const criticalUnhealthy = unhealthy.filter(([, t]) => t.critical);
  const sorted = [...unhealthy].sort(([a, A], [b, B]) => {
    if (A.critical !== B.critical) return A.critical ? -1 : 1;
    if (B.priority !== A.priority) return B.priority - A.priority;
    return a.localeCompare(b);
  });
  const top = sorted[0] ? { topic: sorted[0][0], priority: sorted[0][1].priority, mode: sorted[0][1].mode, stale: sorted[0][1].stale } : null;
  return {
    ...base,
    assessed: true,
    as_of: health.as_of ?? null,
    unhealthy: unhealthy.length,
    critical_unhealthy: criticalUnhealthy.length,
    top,
    pending_grading: pending,
  };
}

function cmdList(positional, flags) {
  // ADR-0010: always scans the resolved goal home.
  const rootAbs = resolveHome();
  if (!existsSync(rootAbs)) die(`goal home not found: ${rootAbs} (set GOAL_OPTIMIZER_HOME or run init first)`);

  const wsDirs = [];
  if (existsSync(join(rootAbs, "goal.yaml"))) wsDirs.push(rootAbs);
  else {
    for (const ent of readdirSync(rootAbs, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const child = join(rootAbs, ent.name);
      if (existsSync(join(child, "goal.yaml"))) wsDirs.push(child);
    }
  }
  if (wsDirs.length === 0) die(`no goals found under ${rootAbs} (looked for goal.yaml)`);

  const goals = wsDirs.map((d) => summarizeGoal(d));
  goals.sort((a, b) => {
    const ac = a.critical_unhealthy > 0 ? 1 : 0;
    const bc = b.critical_unhealthy > 0 ? 1 : 0;
    if (ac !== bc) return bc - ac;
    const ap = a.top ? a.top.priority : -1;
    const bp = b.top ? b.top.priority : -1;
    if (ap !== bp) return bp - ap;
    return String(a.goal_id).localeCompare(String(b.goal_id));
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ root: rootAbs, goals }, null, 2) + "\n");
    return;
  }
  const todayISO = new Date().toISOString().slice(0, 10);
  const L = [`goals under ${rootAbs} (${goals.length} found):`];
  for (const g of goals) {
    L.push("");
    L.push(`  ${g.goal_id}   ${g.title}`);
    const meta = [];
    if (g.target_date) {
      const dleft = Math.round(daysBetween(todayISO, g.target_date));
      meta.push(`target ${g.target_date}${Number.isFinite(dleft) ? ` (${dleft}d left)` : ""}`);
    }
    if (!g.assessed) {
      L.push(`    (unassessed — run: goal.mjs assess --goal ${g.goal_id})`);
      if (meta.length) L.push(`    ${meta.join("   ")}`);
      continue;
    }
    meta.push(`assessed as_of ${g.as_of}`);
    L.push(`    ${meta.join("   ")}`);
    L.push(`    topics ${g.topics} | unhealthy ${g.unhealthy} | critical unhealthy ${g.critical_unhealthy}${g.pending_grading > 0 ? ` | ⚠ ${g.pending_grading} trial(s) await grading` : ""}`);
    if (g.top) L.push(`    top gap  ${g.top.topic}  priority ${g.top.priority}  [${g.top.mode}]${g.top.stale ? "  ⚠ stale" : ""}`);
    else L.push(`    ✓ all topics healthy`);
  }
  process.stdout.write(L.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------
const { positional, flags } = parseArgs(process.argv.slice(2));
const sub = positional.shift();
switch (sub) {
  case "init":
    cmdInit(positional, flags);
    break;
  case "list":
    cmdList(positional, flags);
    break;
  case "task": {
    const verb = positional.shift();
    if (verb === "add") cmdTaskAdd(flags);
    else if (verb === "show") cmdTaskShow(positional, flags);
    else die('usage: task <add|show> ("task add --file <yaml>" installs a task or common grader)');
    break;
  }
  case "grader": {
    const verb = positional.shift();
    if (verb === "add") cmdTaskAdd(flags); // shared: file content decides task vs grader
    else die("usage: grader add --file <yaml>");
    break;
  }
  case "record":
    cmdRecord(flags);
    break;
  case "retract":
    cmdRetract(positional, flags);
    break;
  case "grade":
    cmdGrade(positional, flags);
    break;
  case "assess":
    cmdAssess(flags);
    break;
  case "explain":
    cmdExplain(positional, flags);
    break;
  case "next":
    cmdNext(flags);
    break;
  case "exam":
    cmdExam(flags);
    break;
  default:
    die(
      `unknown subcommand: ${sub ?? "(none)"}\n` +
        `usage: goal.mjs <init|list|task|grader|record|retract|grade|assess|explain|next|exam> [--goal <id>] ...`
    );
}
