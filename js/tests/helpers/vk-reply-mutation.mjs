import assert from 'node:assert/strict';
import { createAutomationRunner } from '../../src/automation/runner.js';

// Inject history changes at the actual typing/outbox boundaries and retain
// the same zero-send and stale-status assertions for each personal reply.
export const refuseMutatedVkReply = async ({
  store,
  preset,
  target,
  alter,
  change,
  text,
}) => {
  let sends = 0,
    typing = 0;
  if (change === 'admission') {
    const put = store.put.bind(store);
    store.put = async (record) => {
      const result = await put(record);
      if (record.id.startsWith('outbox:') && record.status === 'sending') {
        await alter();
      }
      return result;
    };
  }
  const runner = createAutomationRunner({
    store,
    send: async () => {
      sends++;
      return {};
    },
    setTyping: async () => {
      typing++;
    },
    sleep: async () => {
      if (change !== 'admission') {
        await alter();
      }
    },
  });
  const draft = (await runner.run(preset, target)).queued[0];
  assert.ok(draft, change);
  if (change === 'before') {
    await alter();
  }
  const done = await runner.sendDraft(draft.id, { confirm: true, text });
  assert.equal(done.status, 'failed', change);
  assert.equal(done.code, `${preset.action.kind.slice(6)}-stale`, change);
  assert.equal(sends, 0, change);
  assert.ok(typing <= 1, change);
  if (change === 'before') {
    assert.equal(typing, 0);
  }
};
