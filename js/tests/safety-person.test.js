import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { loadSettings, saveSettings } from '../src/automation/safety.js';
import { guardedSend } from '../src/automation/outbox.js';

test('same-ID chat and person opt-outs block distinct targets and remove precisely', async () => {
  const store = createMemoryStore();
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: 'sent', messageId: String(calls) };
  };
  const attempt = (source, chat, contact) =>
    guardedSend({
      store,
      draft: { source, chat, contact, text: 'Synthetic guard probe' },
      send,
    });
  try {
    const settings = await saveSettings(store, {
      optOut: [
        { source: 'vk', chat: '201', note: 'This chat' },
        { source: 'vk', contact: '201', note: 'This person' },
      ],
    });
    assert.equal((await attempt('vk', '201', 'other')).code, 'opted-out');
    assert.equal((await attempt('vk', '202', '201')).code, 'opted-out');
    assert.equal(calls, 0);
    assert.equal((await attempt('telegram', '201', '201')).status, 'sent');
    assert.equal((await attempt('vk', '203', '203')).status, 'sent');
    await saveSettings(store, {
      ...settings,
      optOut: settings.optOut.filter((entry) => entry.contact === undefined),
    });
    assert.equal((await attempt('vk', '201', 'other')).code, 'opted-out');
    assert.equal((await attempt('vk', '202', '201')).status, 'sent');
    assert.deepEqual((await loadSettings(store)).optOut, [settings.optOut[0]]);
    assert.equal(calls, 3);
  } finally {
    await store.close?.();
  }
});
