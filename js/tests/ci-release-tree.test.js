import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(
  new URL('../scripts/validated-release-tree.mjs', import.meta.url)
);
test('release guard compares committed Git trees and rejects source or dependency drift', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'ms-release-tree-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const put = (file, value) =>
    writeFileSync(join(cwd, file), JSON.stringify(value));
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'CI fixture');
  git('config', 'user.email', 'fixture@example.test');
  put('package.json', { version: '1.0.0', dependencies: { fixture: '1.0.0' } });
  put('package-lock.json', {
    version: '1.0.0',
    packages: { '': { version: '1.0.0' } },
  });
  writeFileSync(join(cwd, 'source.js'), 'export const value = 1;');
  const base = commit();
  const check = () =>
    spawnSync(
      process.execPath,
      [...(globalThis.Deno ? ['run', '-A'] : []), guard, base, 'HEAD'],
      { cwd, encoding: 'utf8' }
    );
  put('package.json', { version: '1.0.1', dependencies: { fixture: '1.0.0' } });
  put('package-lock.json', {
    version: '1.0.1',
    packages: { '': { version: '1.0.1' } },
  });
  writeFileSync(join(cwd, 'CHANGELOG.md'), 'A release');
  commit();
  assert.equal(check().status, 0);
  put('package.json', { version: '1.0.2', dependencies: { fixture: '2.0.0' } });
  commit();
  assert.match(check().stderr, /Package configuration changed/);
  git('restore', '--source', base, 'package.json');
  writeFileSync(join(cwd, 'source.js'), 'export const value = 2;');
  commit();
  assert.match(check().stderr, /Source changed after validation/);
});
