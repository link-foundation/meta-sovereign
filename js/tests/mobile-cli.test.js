import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('mobile wrapper invokes the declared Capacitor CLI without resolving another major', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'meta-mobile-cli-'));
  try {
    const bin = join(fixture, 'bin');
    await mkdir(bin);
    // npm and the mobile launcher are Node entry points, including when this
    // regression runs under Bun or Deno. No network/native project is used.
    const script = 'console.log(JSON.stringify(process.argv.slice(2)))';
    const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await writeFile(
      join(bin, executable),
      process.platform === 'win32'
        ? '@node "%~dp0record.cjs" %*\r\n'
        : `#!/usr/bin/env node\n${script}\n`,
      { mode: 0o755 }
    );
    await writeFile(join(bin, 'record.cjs'), script);
    const result = spawnSync(
      'node',
      [resolve('js/scripts/mobile-platform.mjs'), 'sync'],
      {
        cwd: fixture,
        env: {
          ...process.env,
          PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
        },
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.deepEqual(JSON.parse(result.stdout.trim()), [
      'exec',
      '--yes',
      '--package',
      `@capacitor/cli@${pkg.peerDependencies['@capacitor/cli']}`,
      '--',
      'cap',
      'sync',
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
