import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotMemory,
  trackSnapshot,
} from '../../js/src/storage/snapshot-memory.js';
import { loadPreviousModule } from './previous-module.mjs';

// One finite, unrelated diagnostic owner reproduces the shared-process Bun
// failure without starting another encoder or relying on machine timing.
const unrelated = trackSnapshot(90211, 'fixture');
after(() => unrelated.stop());
loadPreviousModule(
  'b98098b7d0b55d60557024eab21461068798641a',
  'js/tests/snapshot-worker-cancellation.test.js'
);
await import('../../js/tests/snapshot-worker-cancellation.test.js');
test('cancellation must preserve an unrelated diagnostic owner', () => {
  assert.equal(
    snapshotMemory().some(({ threadId }) => threadId === 90211),
    true
  );
});
