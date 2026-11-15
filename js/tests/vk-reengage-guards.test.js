import { test } from 'node:test';
import {
  withReengageJob,
  reengageAdapter,
  runReengage,
} from '../../experiments/issue-56/vk-reengage-fixture.mjs';
import { verifyPersonalAdmission } from '../../experiments/issue-56/vk-personal-admission.mjs';
import { reengageLedgerId } from '../src/automation/vk-reengage-settings.js';
import {
  pausedVkPolicy,
  verifyVkDurableWriteFailure,
} from './helpers/vk-policy-lifecycle.mjs';

test('real rate wait and acknowledged intent recheck late conversation, consent, identity, settings and receipts', async () => {
  await verifyPersonalAdmission({
    createAdapter: reengageAdapter,
    withJob: (check, options) => withReengageJob('topic', check, options),
    ledgerId: reengageLedgerId('topic', 1, 9),
    field: 'questions',
    foreignStatus: 'unknown',
  });
});
test('failed durable intent has no effect; failed post-send persistence retains unknown and stops the sequence', async () => {
  await verifyVkDurableWriteFailure(
    (check) => withReengageJob('music', check),
    reengageLedgerId('music', 1, 9),
    runReengage
  );
});
test('owned scheduler coalesces and shutdown aborts pacing before further provider effects', async () => {
  const lifetime = pausedVkPolicy();
  await withReengageJob(
    'music',
    ({ job, adapter }) => lifetime.verify(job, adapter),
    { ...lifetime.options, settings: { enabled: true } }
  );
});
