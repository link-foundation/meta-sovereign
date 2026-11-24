import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForBrowserValue } from './helpers/e2e-browser-value.mjs';

test('asynchronous browser reads resolving false are polled before accepting convergence', async () => {
  const reads = [false, false, { id: 'converged' }];
  const waits = [];
  const page = {
    evaluate: async (read, argument) => read(argument),
    waitForTimeout: async (ms) => waits.push(ms),
  };
  const result = await waitForBrowserValue(page, async () => reads.shift());
  assert.deepEqual(result, { id: 'converged' });
  assert.equal(waits.length, 2);
  assert.equal(reads.length, 0);
});

test('missing convergence fails at the bounded deadline', async () => {
  let reads = 0;
  const page = {
    evaluate: async () => {
      reads++;
      return false;
    },
    waitForTimeout: () => assert.fail('no polling beyond the deadline'),
  };
  await assert.rejects(
    waitForBrowserValue(page, null, null, { timeoutMs: 0 }),
    /timed out/u
  );
  assert.equal(reads, 1);
});

test('browser read exceptions remain failures', async () => {
  const failure = new Error('read failed');
  await assert.rejects(
    waitForBrowserValue({
      evaluate: async () => {
        throw failure;
      },
      waitForTimeout: () => assert.fail('do not retry a read exception'),
    }),
    (error) => error === failure
  );
});
