import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

test('Deno uses the shared locked tree including local security overrides', () => {
  const config = JSON.parse(
    readFileSync(new URL('../../deno.json', import.meta.url), 'utf8')
  );
  assert.equal(config.nodeModulesDir, 'manual');
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
  const install = job.steps.find(
    ({ name }) => name === 'Install locked dependencies (Deno)'
  );
  assert.equal(install.if, "matrix.runtime == 'deno'");
  assert.equal(install.run, 'npm ci --no-audit --no-fund');
  assert.notEqual(install['continue-on-error'], true);
});

test('every Deno platform retains native partitions, test discovery and deadline', () => {
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
  const { matrix } = job.strategy;
  for (const targetOS of ['ubuntu-26.04', 'macos-26', 'windows-2025']) {
    const count = targetOS === 'macos-26' ? 16 : 3;
    assert.deepEqual(
      matrix.include
        .filter(({ os, runtime }) => os === targetOS && runtime === 'deno')
        .flatMap(({ shard }) => {
          const [index, parts] = shard.split('/').map(Number);
          const size = count / parts;
          assert.ok(Number.isInteger(size) && size > 0, shard);
          return Array.from(
            { length: size },
            (_, offset) => (index - 1) * size + offset
          );
        }),
      Array.from({ length: count }, (_, index) => index),
      targetOS
    );
    assert.ok(
      matrix.exclude.some(
        ({ os, runtime }) => os === targetOS && runtime === 'deno'
      ),
      'exclude the original pair so every partition is appended'
    );
  }
  assert.deepEqual(matrix.os, ['ubuntu-26.04', 'macos-26', 'windows-2025']);
  assert.deepEqual(matrix.runtime, ['node', 'bun', 'deno']);
  const mac = matrix.include.filter(
    ({ os, runtime }) => os === 'macos-26' && runtime === 'deno'
  );
  assert.deepEqual(
    mac.map(({ shard, runner }) => [shard, runner ?? 'macos-26']),
    [
      ['1/8', 'macos-26'],
      ['3/16', 'macos-26-intel'],
      ['4/16', 'macos-26-intel'],
      ['3/8', 'macos-26'],
      ['4/8', 'macos-26'],
      ['5/8', 'macos-26'],
      ['6/8', 'macos-26'],
      ['7/8', 'macos-26'],
      ['8/8', 'macos-26'],
    ],
    'the original Intel range is split while the remaining ranges retain ARM'
  );
  assert.equal(job['runs-on'], '${{ matrix.runner || matrix.os }}');
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 10);
  const step = job.steps.find(({ name }) => name === 'Run tests (Deno)');
  assert.match(
    step.run,
    /deno test --allow-all --shard="\$DENO_TEST_SHARD" js\/tests/u
  );
  assert.equal(step.env.DENO_TEST_SHARD, "${{ matrix.shard || '1/1' }}");
  assert.doesNotMatch(step.run, /--filter|--ignore|--fail-fast|\|\| true/u);
  assert.notEqual(step['continue-on-error'], true);
});

test('native Deno shards run every fixture once and propagate failures', (t) => {
  // Node/Bun runners need no extra runtime installation. The Deno CI targets
  // execute this probe with the same pinned executable as their parent suite.
  if (!process.versions.deno) {
    t.skip('native partition probe runs in the existing Deno matrix');
    return;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-deno-shards-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (let index = 0; index < 8; index++) {
    writeFileSync(
      path.join(dir, `${index}.test.js`),
      `Deno.test('fixture ${index}', () => {
console.log('executed:${index}');
if (Deno.env.get('MS_DENO_SHARD_FAIL') === '${index}') throw new Error('fixture failure');
});\n`
    );
  }
  const invoke = (shard, failure = '') =>
    spawnSync(
      process.execPath,
      [
        'test',
        '--no-config',
        '--no-lock',
        '--allow-env=MS_DENO_SHARD_FAIL',
        '--v8-flags=--max-old-space-size=128',
        `--shard=${shard}`,
        dir,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', MS_DENO_SHARD_FAIL: failure },
      }
    );
  const results = Array.from({ length: 8 }, (_, index) => `${index + 1}/8`).map(
    (shard) => ({
      shard,
      result: invoke(shard),
    })
  );
  const executed = [];
  for (const { result } of results) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    executed.push(
      ...Array.from(result.stdout.matchAll(/executed:(\d+)/gu), ([, id]) => id)
    );
  }
  assert.deepEqual(executed.sort(), ['0', '1', '2', '3', '4', '5', '6', '7']);
  const failingShard = results.find(({ result }) =>
    result.stdout.includes('executed:3')
  ).shard;
  const failure = invoke(failingShard, '3');
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.match(failure.stdout + failure.stderr, /fixture failure/u);
  const invalid = invoke('9/8');
  assert.notEqual(invalid.status, 0, invalid.stdout + invalid.stderr);
  assert.doesNotMatch(invalid.stdout, /executed:/u);
});
