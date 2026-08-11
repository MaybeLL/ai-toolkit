# EvalMe

A local-first, append-only **capability measurement system** for humans, organized the way
agent evals are: every question (task) ships with a preregistered grader; every attempt
(trial) leaves a transcript; every conclusion traces back to a line in that transcript.

> Core question: *how far am I from my goal?* — and the answer must be trustworthy,
> inspectable, and recomputable. "What to practice next" is a convenience view on top of
> the measurement infrastructure, not the soul of the system.

The pipeline (spec-v0.2, task-centric — see [docs/SPEC.md](../../docs/SPEC.md) and
[docs/adr/](../../docs/adr/)):

```
define      create       practice       grade            review
定标    →   创建题目  →   练习      →    判定       →     复盘
topics      task +       transcript     per-check        assess → explain → next
词表        grader       + trial        blind verdicts   健康度   证据链    选题
```

- **evalme-define** (M1) — draft the goal's `topics` list: relative weights and
  flags, and the authoritative label vocabulary. No numeric score lines: passing is
  extensional (recent pass rate on unseen/variant tasks), not "reach 0.75".
- **evalme-create** (M2) — build the task bank. Each task = prompt + **preregistered
  grader** (behavior-anchored checks, optional `must_pass`) + labels + difficulty +
  reference solution (QA: the reference must pass its own grader). Three origins:
  `generated` (LLM fills a gap), `imported` (user-supplied question, grader written
  before answering), `imported-live` (real interview normalized after the fact —
  honestly down-weighted). Cross-cutting behaviors (e.g. communication) live in
  **common graders**, defined once and applied across all tasks.
- **evalme-practice** (M3) — host a mock interview from the bank. The interviewer sees the
  prompt **only** (`--prompt-only`, never the checks), saves a verbatim neutral
  transcript (sha256-notarized), and records the trial immediately. Novelty
  (unseen/variant/familiar/repeat) is derived from history, never self-reported.
- **evalme-grade** (M4) — blind, per-check verdicts (`pass|partial|fail|no-evidence`)
  in a fresh context, each with a line-referenced evidence quote. Batchable: trials
  are safe the moment they land; gradings can be added whenever.
- **evalme-review** (M6) — `assess` (deterministic recompute) → `explain` (evidence
  chain, novelty breakdown, growth curves, stale markers) → `next` (a task picker,
  not a task inventor: it selects unattempted unseen/variant tasks for the weakest
  topics, or emits `create_needed`).

### Invariants

- **Facts are immutable.** `transcripts/`, `data/trials.jsonl`, `data/gradings.jsonl`
  are append-only; corrections are retraction records.
- **Projections are derived.** `rm -rf state/ && assess` reproduces byte-identical
  output (recency uses the data's own clock, not wall-time).
- **Every conclusion is traceable** to a line in a transcript, and tasks/graders are
  versioned — a score change is always attributable to *you changed* vs *the standard
  changed*.
- **LLM vs deterministic split:** agents judge meaning (per-check verdicts); the CLI
  computes every number. Displayed levels are coarse bands (weak/uneven/solid/strong),
  not fake-precision decimals.
- **Anti-anchoring is structural,** not verbal: graders are preregistered (temporal
  isolation) and grading runs in a fresh context (spatial isolation).

## Requirements

Only **Node.js** (the CLI is a single zero-dependency `evalme.mjs`). No database, no account,
no cloud. Git is the sync mechanism.

## Install

This plugin ships in the `maybell-plugins` marketplace and loads in three hosts.
After a Claude Code or Codex installation, start a new session before invoking a skill.

- **Claude Code** (user scope by default):

  ```sh
  claude plugin marketplace add MaybeLL/ai-toolkit
  claude plugin install evalme@maybell-plugins
  ```

- **Codex** (install from the repository's `main` branch):

  ```sh
  codex plugin marketplace add MaybeLL/ai-toolkit --ref main
  codex plugin add evalme@maybell-plugins
  ```

- **Pi** (user scope; add `-l` for project-local):

  ```sh
  pi install git:github.com/MaybeLL/ai-toolkit
  ```

  Invoke a skill via e.g. `/skill:evalme-practice` or `/skill:evalme-review`.

For a local checkout, register the repo root as a local marketplace.

## Try the worked example

A complete example workspace lives at
[`examples/backend-system-design/`](./examples/backend-system-design/) — a task bank
(3 tasks + 1 common grader), three graded trials, and the derived health state.

```sh
cd plugins/evalme/scripts
export EVALME_HOME=../examples/backend-system-design
node evalme.mjs explain idempotency
# recompute from facts and confirm it's byte-identical:
rm -rf "$EVALME_HOME/state" && node evalme.mjs assess
```

Your own data lives in the **goal home** — the only location knob is the
`EVALME_HOME` env var (default `~/evalme/`). Skills work from any
cwd in any project repo; data never lands in the current project.

See [`docs/SPEC.md`](../../docs/SPEC.md) for the full data contract, estimator formulas,
and command semantics; design decisions live in [`docs/adr/`](../../docs/adr/).
