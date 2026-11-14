import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

test('macOS Node shards retain every test and fail on a failing shard', (t) => {
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
  const shards = job.strategy.matrix.include.filter(
    ({ os, runtime }) => os === 'macos-26' && runtime === 'node'
  );
  assert.deepEqual(shards.map(({ shard }) => shard).sort(), [
    '1/3',
    '2/3',
    '3/3',
  ]);
  assert.ok(
    job.strategy.matrix.exclude.some(
      ({ os, runtime }) => os === 'macos-26' && runtime === 'node'
    ),
    'append all shards without replacing properties on the original pair'
  );
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 10);
  const step = job.steps.find(({ name }) => name === 'Run tests (Node.js)');
  assert.match(step.run, /--test-shard=/);
  assert.match(step.run, /--test-concurrency=2/);
  assert.notEqual(step['continue-on-error'], true);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-node-shards-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = Array.from({ length: 6 }, (_, index) => {
    const file = path.join(dir, `${index}.test.js`);
    writeFileSync(
      file,
      `console.log('executed:${index}');
if (process.env.MS_SHARD_FAIL === '1' && ${index} === 3) throw new Error('fixture failure');
`
    );
    return file;
  });
  const invoke = (shard, fail = '') => {
    const env = { ...process.env, MS_SHARD_FAIL: fail };
    // This is a separate runner, not another test process in our parent suite.
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(
      'node',
      [
        '--test',
        '--test-reporter=tap',
        '--test-concurrency=1',
        `--test-shard=${shard}`,
        ...files,
      ],
      { encoding: 'utf8', env }
    );
  };
  const results = shards.map(({ shard }) => ({ shard, result: invoke(shard) }));
  const executed = [];
  for (const { result } of results) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    executed.push(
      ...Array.from(result.stdout.matchAll(/# executed:(\d+)/g), ([, id]) => id)
    );
  }
  assert.deepEqual(executed.sort(), ['0', '1', '2', '3', '4', '5']);
  const failingShard = results.find(({ result }) =>
    result.stdout.includes('# executed:3')
  ).shard;
  const failure = invoke(failingShard, '1');
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.match(failure.stdout, /fixture failure/);
});
