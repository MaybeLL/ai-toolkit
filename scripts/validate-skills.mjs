import { readFileSync, readdirSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { marked } from 'marked';
import { repo, discoverSkills } from './catalog.mjs';

export { repo, discoverSkills };
const inside = (root, path) => path === root || path.startsWith(root + sep);

export function validateSkill(directory) {
  const errors = [];
  const root = realpathSync(directory);
  const fail = message => errors.push(`${directory}: ${message}`);
  const readYaml = (text, label) => {
    const document = parseDocument(text, { uniqueKeys: true });
    for (const error of document.errors) fail(`${label}: ${error.message}`);
    return document.errors.length ? {} : document.toJS();
  };
  const entry = resolve(root, 'SKILL.md');
  if (!existsSync(entry)) return [`${directory}: missing SKILL.md`];
  const content = readFileSync(entry, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail('missing or unterminated YAML frontmatter');
  const fm = match ? readYaml(match[1], 'SKILL.md') : {};
  const name = root.split(sep).at(-1);
  if (fm?.name !== name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) fail('invalid name or directory mismatch');
  if (typeof fm?.description !== 'string' || !fm.description.trim() || fm.description.length > 1024) fail('description must be 1–1024 characters');
  if (fm?.compatibility && (typeof fm.compatibility !== 'string' || fm.compatibility.length > 500)) fail('invalid compatibility');

  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      if (['node_modules', '__pycache__', '.git'].includes(name)) continue;
      const file = resolve(path, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) { fail(`symlink is not portable: ${relative(root, file)}`); continue; }
      if (stat.isDirectory()) { walk(file); continue; }
      if (name === 'openai.yaml' && relative(root, file) === 'agents/openai.yaml') {
        const ui = readYaml(readFileSync(file, 'utf8'), 'agents/openai.yaml');
        if (!ui?.interface?.display_name || !ui?.interface?.short_description) fail('UI metadata needs display_name and short_description');
      }
      // Reports are historical development evidence, not runtime documentation.
      if (!name.endsWith('.md') || relative(root, file).split(sep).includes('reports')) continue;
      const markdown = readFileSync(file, 'utf8');
      if (/\/Users\/[^\s/]+\/|\/home\/[^\s/]+\//.test(markdown)) fail(`machine-specific home path in ${relative(root, file)}`);
      const tokens = marked.lexer(markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
      marked.walkTokens(tokens, token => {
        if (!['link', 'image'].includes(token.type)) return;
        const href = token.href;
        if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
        let target;
        try { target = decodeURIComponent(href.split(/[?#]/)[0]); } catch { fail(`invalid link encoding: ${href}`); return; }
        const destination = resolve(dirname(file), target);
        if (!inside(root, destination)) fail(`link leaves skill: ${relative(root, file)} → ${href}`);
        else if (!existsSync(destination)) fail(`missing local link: ${relative(root, file)} → ${href}`);
        else if (!inside(root, realpathSync(destination))) fail(`link escapes through symlink: ${href}`);
      });
    }
  }
  walk(root);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directories = process.argv.slice(2);
  const targets = directories.length ? directories : discoverSkills();
  const errors = targets.flatMap(validateSkill);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`✓ ${targets.length} skills: YAML, names, UI metadata and local Markdown links valid.`);
}
