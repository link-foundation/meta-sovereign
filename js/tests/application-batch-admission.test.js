import test from 'node:test';
import assert from 'node:assert/strict';
import { afterBatchAdmission } from '../../experiments/issue-56/application-batch-admission.mjs';

test('fixture admission recovery never repeats a refused or uncertain issued operation', async () => {
  for (const code of [
    'fixture-backup',
    'jobs-application-state',
    'ECONNRESET',
  ]) {
    let calls = 0;
    const failure = Object.assign(new Error('issued operation refused'), {
      code,
    });
    await assert.rejects(
      afterBatchAdmission(async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure
    );
    assert.equal(calls, 1);
  }
});

test(
  'fixture admission recovery exhausts finitely with the actual busy refusal',
  { timeout: 5000 },
  async () => {
    let calls = 0;
    const failure = Object.assign(new Error('known pre-admission refusal'), {
      code: 'jobs-busy',
    });
    await assert.rejects(
      afterBatchAdmission(async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure
    );
    assert.equal(calls, 200);
  }
);
