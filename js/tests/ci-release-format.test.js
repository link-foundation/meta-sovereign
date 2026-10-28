import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildNpmVersionBadge,
  hasNpmVersionBadge,
} from '../scripts/format-release-notes-helpers.mjs';
import { commitReleaseVersion } from '../scripts/version-and-commit-helpers.mjs';
import { loadCommandStream } from '../scripts/use-module.mjs';

test('release notes skip only the generated badge for the requested package and version', () => {
  const packageName = '@fixture/package';
  const version = 'v1.2.3';
  const badge = buildNpmVersionBadge(packageName, version);
  assert.equal(
    hasNpmVersionBadge(`Release notes\n\n${badge}`, packageName, version),
    true
  );
  for (const body of [
    '',
    'Fix img.shields.io rendering',
    'https://img.shields.io.attacker.invalid/badge/npm-1.2.3-blue.svg',
    'https://attacker.invalid/img.shields.io',
    'https://img.shields.io@attacker.invalid/badge/npm-1.2.3-blue.svg',
    buildNpmVersionBadge('@fixture/other', version),
    buildNpmVersionBadge(packageName, 'v1.2.2'),
  ]) {
    assert.equal(hasNpmVersionBadge(body, packageName, version), false, body);
  }
});

test(
  'release commits preserve literal quotes, backslashes and shell metacharacters',
  { timeout: 10000 },
  async (t) => {
    const cwd = mkdtempSync(join(tmpdir(), 'ms-release-message-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const git = (...args) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
    git('init');
    git('config', 'user.name', 'CI fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    const { $ } = await loadCommandStream();
    const inFixture = $({ cwd });
    for (const version of [
      '1.2.3',
      String.raw`1.2.4 "quoted" C:\release\ $(exit 9) \`exit 9\``,
    ]) {
      writeFileSync(join(cwd, 'version.txt'), version);
      git('add', 'version.txt');
      await commitReleaseVersion(inFixture, version);
      assert.equal(git('log', '-1', '--format=%B').trimEnd(), version);
    }
  }
);
