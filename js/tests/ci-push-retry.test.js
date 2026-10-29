import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from '../scripts/version-and-commit-helpers.mjs';

const rejected = (stderr) =>
  Object.assign(new Error('git push failed'), { stderr });

test('a version push race repeats preparation before retrying', async () => {
  assert.equal(typeof helpers.retryVersionPush, 'function');
  const prepared = [];
  const result = await helpers.retryVersionPush(
    async (attempt) => {
      // The caller fetches and validates main, then recomputes the version on
      // each invocation, rather than replaying stale generated metadata.
      prepared.push(attempt);
      if (attempt === 1) {
        throw rejected('! [rejected] HEAD -> main (fetch first)');
      }
      return { version: '1.0.2', pushed: true };
    },
    { log: () => {} }
  );
  assert.deepEqual(prepared, [1, 2]);
  assert.deepEqual(result, { version: '1.0.2', pushed: true });
});

test('policy, authentication and transport refusals never retry; races are bounded', async () => {
  assert.equal(typeof helpers.retryVersionPush, 'function');
  for (const [message, expected] of [
    ['GH013: repository rule violations; [rejected] (non-fast-forward)', 1],
    ['GH006: protected branch update failed; fetch first', 1],
    ['Permission denied (403)', 1],
    ['Could not resolve host: github.com', 1],
    ['! [rejected] HEAD -> main (non-fast-forward)', 3],
    [
      "remote: error: cannot lock ref 'refs/heads/main': is at aabbcc but expected ddeeff",
      3,
    ],
  ]) {
    let attempts = 0;
    const error = rejected(message);
    await assert.rejects(
      helpers.retryVersionPush(
        async () => {
          attempts++;
          throw error;
        },
        { log: () => {} }
      ),
      (actual) => actual === error
    );
    assert.equal(attempts, expected, message);
  }
});
