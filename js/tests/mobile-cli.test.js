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
    // Fake npm records arguments; no network or real native project is used.
    const script = 'console.log(JSON.stringify(process.argv.slice(2)))';
    const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await writeFile(
      join(bin, executable),
      process.platform === 'win32'
        ? `@"${process.execPath}" "%~dp0record.cjs" %*\r\n`
        : `#!${process.execPath}\n${script}\n`,
      { mode: 0o755 }
    );
    await writeFile(join(bin, 'record.cjs'), script);
    const result = spawnSync(
      process.execPath,
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
