import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

test('Windows Deno partitions retain the original test discovery and deadline', () => {
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
  const { matrix } = job.strategy;
  assert.deepEqual(
    matrix.include
      .filter(({ os, runtime }) => os === 'windows-2025' && runtime === 'deno')
      .map(({ shard }) => shard)
      .sort(),
    ['1/3', '2/3', '3/3']
  );
  assert.ok(
    matrix.exclude.some(
      ({ os, runtime }) => os === 'windows-2025' && runtime === 'deno'
    ),
    'exclude the original pair so all three entries are appended'
  );
  assert.deepEqual(matrix.os, ['ubuntu-26.04', 'macos-26', 'windows-2025']);
  assert.deepEqual(matrix.runtime, ['node', 'bun', 'deno']);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 10);
  const step = job.steps.find(({ name }) => name === 'Run tests (Deno)');
  assert.match(
    step.run,
    /deno test --allow-all --shard=\$\{\{ matrix.shard \|\| '1\/1' \}\} js\/tests/u
  );
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
  for (let index = 0; index < 6; index++) {
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
  const results = ['1/3', '2/3', '3/3'].map((shard) => ({
    shard,
    result: invoke(shard),
  }));
  const executed = [];
  for (const { result } of results) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    executed.push(
      ...Array.from(result.stdout.matchAll(/executed:(\d+)/gu), ([, id]) => id)
    );
  }
  assert.deepEqual(executed.sort(), ['0', '1', '2', '3', '4', '5']);
  const failingShard = results.find(({ result }) =>
    result.stdout.includes('executed:3')
  ).shard;
  const failure = invoke(failingShard, '3');
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.match(failure.stdout + failure.stderr, /fixture failure/u);
  const invalid = invoke('4/3');
  assert.notEqual(invalid.status, 0, invalid.stdout + invalid.stderr);
  assert.doesNotMatch(invalid.stdout, /executed:/u);
});
