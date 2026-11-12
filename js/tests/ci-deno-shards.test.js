import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

const job = () =>
  parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
const windowsDeno = ({ os, runtime }) =>
  os === 'windows-2025' && runtime === 'deno';

test('Windows Deno partitions preserve coverage and the existing deadline', () => {
  const runtime = job();
  const shards = runtime.strategy.matrix.include.filter(windowsDeno);
  assert.deepEqual(shards.map(({ shard }) => shard).sort(), [
    '1/3',
    '2/3',
    '3/3',
  ]);
  assert.ok(runtime.strategy.matrix.exclude.some(windowsDeno));
  assert.deepEqual(runtime.strategy.matrix.runtime, ['node', 'bun', 'deno']);
  assert.deepEqual(runtime.strategy.matrix.os, [
    'ubuntu-26.04',
    'macos-26',
    'windows-2025',
  ]);
  assert.equal(runtime.strategy['fail-fast'], false);
  assert.equal(runtime['timeout-minutes'], 10);
  const step = runtime.steps.find(({ name }) => name === 'Run tests (Deno)');
  assert.match(
    step.run,
    /deno test --allow-all --shard="\$DENO_TEST_SHARD" js\/tests/u
  );
  assert.equal(step.env.DENO_TEST_SHARD, "${{ matrix.shard || '1/1' }}");
  assert.doesNotMatch(step.run, /--filter|--ignore|--permit-no-files/u);
  assert.notEqual(step['continue-on-error'], true);
});

test('native Deno shards execute every fixture once and propagate failures', (t) => {
  const available = spawnSync('deno', ['--version'], { encoding: 'utf8' });
  if (available.error?.code === 'ENOENT') {
    t.skip(
      'The native fixture runs in Deno jobs; other runtimes verify the matrix.'
    );
    return;
  }
  assert.equal(available.status, 0, available.stderr);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ms-deno-shards-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (let index = 0; index < 6; index++) {
    writeFileSync(
      path.join(directory, `${index}.test.js`),
      `Deno.test('fixture ${index}', () => {
  console.log('executed:${index}');
  if (Deno.env.get('MS_SHARD_FAIL') === '1' && ${index} === 3) {
    throw new Error('fixture failure');
  }
});\n`
    );
  }
  const invoke = (shard, fail = '') => {
    const env = { ...process.env, MS_SHARD_FAIL: fail, NO_COLOR: '1' };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(
      'deno',
      [
        'test',
        '--allow-env',
        '--no-config',
        '--no-lock',
        `--shard=${shard}`,
        directory,
      ],
      { encoding: 'utf8', env }
    );
  };
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
  const failure = invoke(failingShard, '1');
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.match(failure.stdout + failure.stderr, /fixture failure/u);
});
