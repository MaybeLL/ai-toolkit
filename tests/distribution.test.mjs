import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateSkill, repo, skillRoot } from '../scripts/validate-skills.mjs';

function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-toolkit-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('validator rejects malformed metadata, missing resources and paths outside a skill', t => {
  const root = temporary(t);
  const skill = join(root, 'demo');
  mkdirSync(skill);
  const entry = join(skill, 'SKILL.md');
  const valid = '---\nname: demo\ndescription: |\n  A multiline description.\n---\n';
  writeFileSync(entry, valid + '[missing](references/no.md)\n[outside](../secret.md)\n');
  const errors = validateSkill(skill);
  assert.ok(errors.some(e => e.includes('missing local link')));
  assert.ok(errors.some(e => e.includes('link leaves skill')));
  writeFileSync(entry, valid + '\n```md\n[example](not-a-resource.md)\n```\n');
  assert.deepEqual(validateSkill(skill), []);
  writeFileSync(entry, '---\nname: demo\nname: demo\ndescription: ok\n---\n');
  assert.ok(validateSkill(skill).some(e => e.includes('unique')));
  writeFileSync(entry, valid);
  writeFileSync(join(root, 'secret.md'), 'not for distribution');
  symlinkSync(join(root, 'secret.md'), join(skill, 'leak.md'));
  assert.ok(validateSkill(skill).some(e => e.includes('symlink')));
});

test('every ZIP is self-contained, licensed, checksummed and repeatable; extracted drawio runs offline', t => {
  const root = temporary(t);
  const output = join(root, 'release');
  const rebuilt = join(root, 'rebuilt');
  for (const destination of [output, rebuilt]) {
    execFileSync('python3', ['scripts/package-skills.py', '--output', destination], { cwd: repo });
  }
  const manifest = JSON.parse(readFileSync(join(output, 'release.json')));
  assert.equal(manifest.skills.length, readdirSync(skillRoot).length);
  for (const file of readdirSync(output)) {
    assert.deepEqual(readFileSync(join(output, file)), readFileSync(join(rebuilt, file)), file);
  }
  const extracted = join(root, 'extracted');
  execFileSync('python3', ['-c', `
import hashlib, pathlib, sys, zipfile
source, target = map(pathlib.Path, sys.argv[1:])
for line in (source / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == digest
for archive in source.glob('*.zip'):
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            p = pathlib.PurePosixPath(name)
            assert not p.is_absolute() and '..' not in p.parts
            assert not any(part in ('reports', 'fixtures', '__pycache__', 'node_modules') for part in p.parts)
            assert not name.endswith('.test.js')
        z.extractall(target)
`, output, extracted]);
  for (const { name } of manifest.skills) {
    const directory = join(extracted, name);
    assert.deepEqual(validateSkill(directory), []);
    assert.ok(existsSync(join(directory, 'LICENSE')));
    assert.equal(JSON.parse(readFileSync(join(directory, 'SOURCE.json'))).version, manifest.version);
  }
  const drawio = join(extracted, 'drawio');
  const result = join(root, 'diagram.drawio');
  execFileSync(process.execPath, [join(drawio, 'scripts/cli.js'), join(drawio, 'references/examples/login-flow.yaml'), result, '--validate'], { cwd: root });
  assert.match(readFileSync(result, 'utf8'), /<mxfile/);
  assert.throws(() => execFileSync('python3', ['scripts/package-skills.py', '--output', output], { cwd: repo, stdio: 'pipe' }), /Output must be empty/);
});

test('pinned skills CLI discovers all skills and installs a selected skill into an isolated project', t => {
  const root = temporary(t);
  const cli = join(repo, 'node_modules/skills/bin/cli.mjs');
  const options = { cwd: root, encoding: 'utf8', env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', CI: 'true' }, timeout: 60000 };
  const listed = execFileSync(process.execPath, [cli, 'add', repo, '--list'], options);
  for (const name of readdirSync(skillRoot)) assert.ok(listed.includes(name), `discovered ${name}`);
  execFileSync(process.execPath, [cli, 'add', repo, '--skill', 'software-design-philosophy', '--agent', 'codex', '--copy', '-y'], options);
  const installed = join(root, '.agents/skills/software-design-philosophy');
  assert.deepEqual(validateSkill(installed), []);
  assert.equal(readFileSync(join(installed, 'SKILL.md'), 'utf8'), readFileSync(join(skillRoot, 'software-design-philosophy/SKILL.md'), 'utf8'));
  assert.ok(existsSync(join(installed, 'references/sources.md')));
  assert.deepEqual(readdirSync(join(root, '.agents/skills')), ['software-design-philosophy']);
});
