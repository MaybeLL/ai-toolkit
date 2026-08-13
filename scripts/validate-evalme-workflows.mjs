#!/usr/bin/env node
// Guard workflow-level policies that cannot be enforced by the deterministic CLI.
// Run from the repository root: node scripts/validate-evalme-workflows.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const createSkill = readFileSync(join(repo, "plugins/evalme/skills/evalme-create/SKILL.md"), "utf8");
const practiceSkill = readFileSync(join(repo, "plugins/evalme/skills/evalme-practice/SKILL.md"), "utf8");
const generated = createSkill.match(/^### 出题\(generated\)\n([\s\S]*?)(?=^### )/m)?.[1];

if (!generated) fail("generated section exists in evalme-create");

const approval = "用户明确确认";
const approvalAt = generated.indexOf(approval);
const writeAt = generated.indexOf("`task add`");
if (approvalAt === -1) fail(`generated workflow requires ${approval}`);
if (writeAt === -1) fail("generated workflow invokes task add");
if (approvalAt > writeAt) fail("generated workflow requires approval before task add");

for (const [policy, marker] of [
  ["rejects a context that has seen graders or reference solutions", "当前上下文只要看过 grader、reference_solution"],
  ["asks exactly one main question per turn", "每个 assistant 回合最多只提出一个主问题"],
  ["does not expose later questions early", "不得提前展示后续问题"],
  ["puts candidate-visible question text in the assistant response", "必须写进 assistant 正文"],
  ["limits each answer to one neutral follow-up", "最多进行一个中立追问"],
  ["forbids evaluative or leading follow-ups", "不得确认答案正确、暗示目标动作"],
  ["records accidental leading as hints", "也必须记 `--hints true`"],
]) {
  if (!practiceSkill.includes(marker)) fail(`evalme-practice ${policy} (missing: ${marker})`);
}

const cli = join(repo, "plugins/evalme/scripts/evalme.mjs");
const example = join(repo, "plugins/evalme/examples/backend-system-design");
const exam = JSON.parse(
  execFileSync(process.execPath, [cli, "exam", "--size", "1", "--as-of", "2001-02-03T04:05:06Z"], {
    encoding: "utf8",
    env: { ...process.env, EVALME_HOME: example },
  })
);
if (exam.session_id.startsWith("ses-exam-2001-02-03")) {
  fail("exam session_id must be created from the current run, not the evidence as_of clock");
}
if (!/^ses-exam-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(exam.session_id)) {
  fail(`exam session_id has unexpected shape: ${exam.session_id}`);
}
const nextExam = JSON.parse(
  execFileSync(process.execPath, [cli, "exam", "--size", "1", "--as-of", "2001-02-03T04:05:06Z"], {
    encoding: "utf8",
    env: { ...process.env, EVALME_HOME: example },
  })
);
if (nextExam.session_id === exam.session_id) fail("each exam composition must suggest a fresh session_id");
if (JSON.stringify(nextExam.paper) !== JSON.stringify(exam.paper)) {
  fail("exam selection must remain deterministic when only the fresh session identity changes");
}

console.log("✓ EvalMe workflow policies valid: approval, clean hosting context, one-question turns, neutral probing, and fresh exam sessions.");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
