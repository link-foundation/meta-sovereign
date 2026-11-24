import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { inspect } from 'node:util';

const before = process.argv.includes('--before');
const module = before
  ? await import(
      `data:text/javascript;base64,${execFileSync('git', [
        'show',
        'b18c9d0a:js/src/automation/trigger-log.js',
      ]).toString('base64')}`
    )
  : await import('../../js/src/automation/trigger-log.js');
const entries = [];
const cause = Error('fixture-user-token refused');
const failure = Error('<redacted> refused', { cause });
await assert.rejects(
  module.traceTrigger(
    (entry) => entries.push(entry),
    'finite-fixture',
    async () => {
      throw failure;
    }
  ),
  (error) => error === failure
);
const retained = entries.at(-1).error;
assert.equal(Object.hasOwn(retained, 'cause'), false);
assert.equal(inspect(retained).includes('fixture-user-token'), false);
assert.equal(retained.message, '<redacted> refused');
console.log(
  'Custom diagnostic sink retains only a redacted plain error; delivery rejection is unchanged.'
);
