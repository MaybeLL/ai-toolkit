#!/usr/bin/env node
// Plugin metadata validator: name/version consistency across manifests, Pi
// resource paths, discovery configuration, and marketplace entries.
// Run from the repo root: `node scripts/validate-plugin-metadata.mjs`
// Reports all failed assertions before exiting non-zero.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { repo, discoverPlugins, discoverSkills } from './catalog.mjs';

const pluginsDir = join(repo, "plugins");
const plugins = discoverPlugins();
const pluginDirs = plugins.map(plugin => plugin.name);
const skills = discoverSkills();
const pkg = readJson(join(repo, "package.json"));

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}
function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

check(pluginDirs.length > 0, "at least one plugin under plugins/");

const expectedPiSkills = pluginDirs.map((n) => `./plugins/${n}/skills`);
const marketplaces = [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"];

for (const name of pluginDirs) {
  const plugin = join(pluginsDir, name);

  // Manifests
  const claudePath = join(plugin, ".claude-plugin/plugin.json");
  const codexPath = join(plugin, ".codex-plugin/plugin.json");
  check(existsSync(claudePath), `${name}: .claude-plugin/plugin.json exists`);
  check(existsSync(codexPath), `${name}: .codex-plugin/plugin.json exists`);
  if (!existsSync(claudePath) || !existsSync(codexPath)) continue;

  const claude = readJson(claudePath);
  const codex = readJson(codexPath);

  // name + version consistency (the hard invariant)
  check(claude.name === name, `${name}: claude manifest name == ${name} (got ${claude.name})`);
  check(codex.name === name, `${name}: codex manifest name == ${name} (got ${codex.name})`);
  check(
    claude.version === codex.version && codex.version === pkg.version,
    `${name}: version identical across claude/codex/package.json (got ${claude.version}/${codex.version}/${pkg.version})`
  );

  check(codex.skills === "./skills/", `${name}: Codex skills path == ./skills/`);
  const skillsDir = join(plugin, "skills");
  check(existsSync(skillsDir), `${name}: skills directory exists`);
  if (existsSync(skillsDir)) {
    check(readdirSync(skillsDir).some((skill) => existsSync(join(skillsDir, skill, "SKILL.md"))), `${name}: at least one Skill`);
  }
}

// These workflow wrappers must remain installable with their companions.
for (const plugin of plugins) {
  const names = plugin.skills.map(path => basename(path));
  for (const [name, companions] of Object.entries({
    'grill-me': ['grilling'],
    'grill-with-docs': ['grilling', 'domain-modeling'],
  })) {
    if (names.includes(name)) {
      for (const companion of companions) check(names.includes(companion), `${name}: companion ${companion} must be in the same plugin`);
    }
  }
}

// Pi package resources: every plugin's skills dir must be declared in pi.skills
check(Array.isArray(pkg.keywords) && pkg.keywords.includes("pi-package"), 'package.json keywords include "pi-package"');
check(
  JSON.stringify(pkg.pi?.skills) === JSON.stringify(expectedPiSkills),
  `pi.skills == [${expectedPiSkills.join(", ")}]`
);
for (const res of [...(pkg.pi?.skills ?? []), ...(pkg.pi?.extensions ?? [])]) {
  check(existsSync(join(repo, res)), `pi resource path exists: ${res}`);
}

const discovery = readJson(join(repo, "skills.sh.json"));
check(JSON.stringify(discovery.paths) === JSON.stringify(expectedPiSkills), "skills.sh.json and Pi discover the same source directories");
const lock = readJson(join(repo, "package-lock.json"));
check(lock.version === pkg.version && lock.packages?.[""].version === pkg.version, "lockfile version matches package.json");
const changelog = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
check(changelog.split("\n").includes(`## ${pkg.version}`), "changelog contains current release version");

// Marketplaces list every plugin
for (const mp of marketplaces) {
  const m = readJson(join(repo, mp));
  check(m.name === "maybell-plugins", `${mp} name == maybell-plugins`);
  const listed = m.plugins?.map((it) => it.name) ?? [];
  check(
    JSON.stringify(listed.sort()) === JSON.stringify([...pluginDirs].sort()),
    `${mp} lists all plugins: ${listed.join(", ")} == ${pluginDirs.join(", ")}`
  );
  for (const entry of m.plugins ?? []) {
    const source = mp.startsWith('.agents/') ? entry.source?.path : entry.source;
    check(source === `./plugins/${entry.name}`, `${mp}: ${entry.name} source points to its plugin`);
    if (mp.startsWith('.agents/')) check(entry.source?.source === 'local', `${mp}: local plugin source required`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} metadata check(s) failed.`);
  process.exit(1);
}
console.log(`✓ plugin metadata valid: ${pluginDirs.length} plugin(s), ${skills.length} skill(s), both marketplaces, Pi resources.`);
