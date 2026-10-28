// Real temporary git histories reproduce CI selection; no GitHub/network calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../scripts/detect-code-changes.mjs', import.meta.url)
);
const fixture = (t) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ms-ci-diff-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'CI fixture');
  git('config', 'user.email', 'fixture@example.test');
  const commit = (file) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), `${file}\n`);
    git('add', '.');
    git('commit', '-m', file);
    return git('rev-parse', 'HEAD');
  };
  const run = (env = {}) =>
    spawnSync(
      process.execPath,
      globalThis.Deno ? ['run', '-A', script] : [script],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: '',
          GITHUB_EVENT_PATH: '',
          ...env,
        },
      }
    );
  return { cwd, git, commit, run };
};

test('PR checks include earlier code after a docs-only follow-up', (t) => {
  const { git, commit, run } = fixture(t);
  const base = commit('README.md');
  git('checkout', '-b', 'feature');
  commit('js/src/changed.js');
  const head = commit('docs/follow-up.md');
  git('checkout', 'main');
  git('merge', '--no-ff', 'feature', '-m', 'synthetic merge');
  const result = run({
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_SHA: base,
    GITHUB_HEAD_SHA: head,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /js-changed=true/);
  assert.match(result.stdout, /any-code-changed=true/);
});

test('multi-commit push checks the whole event range', (t) => {
  const { cwd, commit, run } = fixture(t);
  const before = commit('README.md');
  commit('rust/crates/core/src/lib.rs');
  const after = commit('docs/follow-up.md');
  const event = path.join(cwd, 'event.json');
  writeFileSync(event, JSON.stringify({ before, after }));
  const result = run({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rust-changed=true/);
  assert.match(result.stdout, /any-code-changed=true/);
});

test('initial commit is checked instead of silently returning no changes', (t) => {
  const { commit, run } = fixture(t);
  commit('js/src/initial.js');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /js-changed=true/);
});

test('evidence snapshots never count as executable code changes', (t) => {
  const { commit, run } = fixture(t);
  commit('README.md');
  commit('dev/log/issues/43/pulls/44/templates/source.mjs');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mjs-changed=false/);
  assert.match(result.stdout, /any-code-changed=false/);
});

test('unavailable explicit PR revisions fail closed', (t) => {
  const { commit, run } = fixture(t);
  const head = commit('README.md');
  const result = run({
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_SHA: 'f'.repeat(40),
    GITHUB_HEAD_SHA: head,
  });
  assert.notEqual(result.status, 0);
});
