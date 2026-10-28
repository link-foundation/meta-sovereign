import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('Bun discovers maintained tests without executing evidence or build output', (t) => {
  if (!process.versions.bun) {
    t.skip('Bun test discovery is verified by the Bun CI legs');
    return;
  }
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ms-bun-discovery-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    path.join(cwd, 'bunfig.toml'),
    readFileSync(new URL('../../bunfig.toml', import.meta.url))
  );
  for (const dir of ['js/tests', 'dev/log/reference', 'dist']) {
    mkdirSync(path.join(cwd, dir), { recursive: true });
  }
  writeFileSync(
    path.join(cwd, 'js/tests/owned.test.js'),
    "import { test } from 'bun:test';\n" +
      "import { writeFileSync } from 'node:fs';\n" +
      `test('owned fixture', () => writeFileSync(${JSON.stringify(path.join(cwd, 'owned-ran'))}, 'yes'));\n`
  );
  for (const dir of ['dev/log/reference', 'dist']) {
    writeFileSync(
      path.join(cwd, dir, 'foreign.test.js'),
      "throw new Error('Foreign evidence/build tests must not execute');\n"
    );
  }
  const result = spawnSync(process.execPath, ['test', '--timeout', '1000'], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(path.join(cwd, 'owned-ran')), true);
});
