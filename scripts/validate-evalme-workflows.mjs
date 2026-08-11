#!/usr/bin/env node
// Guard workflow-level policies that cannot be enforced by the deterministic CLI.
// Run from the repository root: node scripts/validate-evalme-workflows.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const createSkill = readFileSync(join(repo, "plugins/evalme/skills/evalme-create/SKILL.md"), "utf8");
const generated = createSkill.match(/^### 出题\(generated\)\n([\s\S]*?)(?=^### )/m)?.[1];

if (!generated) fail("generated section exists in evalme-create");

const approval = "用户明确确认";
const approvalAt = generated.indexOf(approval);
const writeAt = generated.indexOf("`task add`");
if (approvalAt === -1) fail(`generated workflow requires ${approval}`);
if (writeAt === -1) fail("generated workflow invokes task add");
if (approvalAt > writeAt) fail("generated workflow requires approval before task add");

console.log("✓ EvalMe workflow policies valid: generated tasks require explicit user approval before task add.");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
