// Contrast release-only lock synchronization with and without legacy peer mode.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withoutReleaseVersion } from '../js/scripts/validated-release-tree.mjs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const beforeText = readFileSync('package-lock.json', 'utf8');
const before = JSON.parse(beforeText);
for (const mode of ['legacy', 'current', 'version']) {
  const cwd = mkdtempSync(join(tmpdir(), 'ms-release-lock-'));
  try {
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ ...manifest, version: '1.0.0' })
    );
    writeFileSync(join(cwd, 'package-lock.json'), beforeText);
    const args =
      mode === 'version'
        ? [
            'version',
            '1.0.0',
            '--allow-same-version',
            '--no-git-tag-version',
            '--ignore-scripts',
          ]
        : [
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            ...(mode === 'legacy' ? ['--legacy-peer-deps'] : []),
          ];
    const result = spawnSync('npm', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' },
    });
    assert.equal(result.status, 0, result.stderr);
    const afterText = readFileSync(join(cwd, 'package-lock.json'), 'utf8');
    const after = JSON.parse(afterText);
    const changed = [
      ...new Set([
        ...Object.keys(before.packages),
        ...Object.keys(after.packages),
      ]),
    ].filter(
      (key) =>
        key &&
        JSON.stringify(before.packages[key]) !==
          JSON.stringify(after.packages[key])
    );
    console.log(
      JSON.stringify(
        {
          mode,
          safe:
            withoutReleaseVersion('package-lock.json', beforeText) ===
            withoutReleaseVersion('package-lock.json', afterText),
          changed: changed.map((key) => ({
            key,
            before: before.packages[key],
            after: after.packages[key],
          })),
        },
        null,
        2
      )
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
