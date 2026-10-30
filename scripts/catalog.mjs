import { readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function directories(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    if (!entry.isDirectory()) throw new Error(`Expected a source directory: ${resolve(root, entry.name)}`);
    return resolve(root, entry.name);
  });
}

export function discoverPlugins(root = repo) {
  return directories(resolve(root, 'plugins')).map(directory => ({
    name: basename(directory),
    directory,
    skills: directories(resolve(directory, 'skills')),
  }));
}

export function discoverSkills(root = repo) {
  const skills = discoverPlugins(root).flatMap(plugin => plugin.skills);
  const names = new Set();
  for (const skill of skills) {
    const name = basename(skill);
    if (names.has(name)) throw new Error(`Duplicate Skill name across plugins: ${name}`);
    names.add(name);
  }
  return skills;
}
