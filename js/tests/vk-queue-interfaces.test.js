import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import { ordinaryCommandNames } from '../src/cli/command-names.js';
import { createVkSendQueueCommands } from '../src/cli/vk-send-queue-commands.js';
import { createVkSendQueueApi } from '../src/web/vk-send-queue-api.js';
import {
  loadVkSendQueue,
  saveVkSendQueue,
} from '../src/automation/vk-queue-inspection.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  ownedVkCommand,
  offlineVkPolicy,
  assertVkTranslations,
} from './helpers/vk-policy-interfaces.mjs';
import { queueServer } from '../../experiments/issue-56/vk-queue-fixture.mjs';

test('foreground admission exposes the VK send queue command', () => {
  assert.equal(ordinaryCommandNames.has('vk-send-queue'), true);
});
test('CLI reads without opening writable storage, saves validated settings and always closes', async () => {
  const f = offlineVkPolicy(createVkSendQueueApi);
  const owned = ownedVkCommand(
    createVkSendQueueCommands,
    'vk-send-queue',
    f.store
  );
  const { command, log, answer, closed } = owned;
  await command({}, log);
  assert.equal(answer().settings.enabled, false);
  await command(
    { enabled: 'true', 'mark-read': false, 'chars-per-minute': '600' },
    log
  );
  assert.deepEqual(answer().settings, {
    enabled: true,
    markRead: false,
    typing: true,
    charsPerMinute: 600,
  });
  await assert.rejects(command({ typing: 'yes' }, log), /true or false/);
  await assert.rejects(command({ 'chars-per-minute': 59 }, log), /60 to 3000/);
  assert.equal(closed(), 3);
  let writable = false;
  const readOnly = createVkSendQueueCommands({
    openStore: () => {
      writable = true;
      throw new Error('Unexpected writable opening');
    },
    openReadOnly: async () => f.store,
  });
  await readOnly['vk-send-queue']({}, log);
  assert.equal(writable, false);
});
test(
  'text and binary Lino routes enforce origin and share acknowledged queue settings and inspection',
  { timeout: 15000 },
  async () => {
    const f = await queueServer();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(f.base, '/api/vk/send-queue', type);
        assert.equal(
          (await post('', { enabled: true }, 'https://foreign.invalid')).status,
          403
        );
        const saved = await post('', { enabled: true, charsPerMinute: 450 });
        assert.equal(saved.answer.settings.enabled, true);
        assert.equal(saved.answer.canRun, false);
        assert.equal((await post('', { typing: 1 })).status, 400);
        const response = await fetch(`${f.base}/api/vk/send-queue`, {
          headers: { accept: type },
        });
        assert.equal(
          (await readWireResponse(response)).settings.charsPerMinute,
          450
        );
      }
      assert.equal(f.calls.length, 0);
      f.refuseWrites(true);
      const post = createWirePost(f.base, '/api/vk/send-queue', LINO_BINARY);
      assert.equal((await post('', { enabled: false })).answer.ok, false);
      assert.equal((await loadVkSendQueue(f.store)).settings.enabled, true);
    } finally {
      f.refuseWrites(false);
      await f.close();
    }
  }
);
test('offline four-language controls share acknowledged settings without starting or resuming delivery', async () => {
  const { api, store } = offlineVkPolicy(createVkSendQueueApi);
  assert.equal((await api.vkSendQueue()).runtime, null);
  assert.equal(
    (await api.saveVkSendQueue({ enabled: true })).settings.enabled,
    true
  );
  assert.equal((await api.vkSendQueue()).canRun, false);
  store.flush = async () => {
    throw new Error('Synthetic flush refusal');
  };
  await assert.rejects(api.saveVkSendQueue({ charsPerMinute: 750 }));
  assert.equal((await loadVkSendQueue(store)).settings.charsPerMinute, 450);
  assertVkTranslations('vkQueue', ['title', 'speed', 'delivery', 'drafts'], {
    complete: true,
  });
});
test('inspection streams bounded recent receipts and peer states and distinguishes interrupted pacing from delivery', async () => {
  const { store } = offlineVkPolicy(createVkSendQueueApi);
  for (let i = 0; i < 54; i++) {
    const at = new Date(1000 * i).toISOString();
    await store.put({
      id: `vk-outgoing:${i}`,
      source: 'vk',
      status: 'pacing',
      startedAt: at,
      outboxId: `outbox:${i}`,
    });
    await store.put({ id: `outbox:${i}`, status: 'unknown' });
    await store.put({
      id: `automation-peer-state:${i}`,
      source: 'vk',
      lastTriggered: at,
      status: 'processed',
      drafts: 2,
    });
  }
  store.query = () => {
    throw new Error('Production inspection must stream');
  };
  const out = await loadVkSendQueue(store);
  assert.equal(out.items.length, 50);
  assert.equal(out.peers.length, 50);
  assert.equal(out.total, 54);
  assert.equal(out.peerTotal, 54);
  assert.equal(out.items[0].id, 'vk-outgoing:53');
  assert.equal(out.items[0].status, 'interrupted');
  assert.equal(out.items[0].delivery, 'unknown');
  assert.equal(out.peers[0].status, 'processed');
});
test(
  'server shutdown drains a shared outgoing provider call before final flush and releases no unrelated fixture',
  { timeout: 15000 },
  async (t) => {
    const f = await queueServer();
    const release = Promise.withResolvers();
    const entered = Promise.withResolvers();
    let closing;
    const running = f.queue.run({ key: 'held', draft: {} }, async () => {
      entered.resolve();
      await release.promise;
      return 7;
    });
    try {
      await Promise.race([
        entered.promise,
        once(t.signal, 'abort').then(() => {
          throw new Error('Test aborted before provider admission');
        }),
      ]);
      let closed = false;
      closing = f.close().then(() => {
        closed = true;
      });
      await turn();
      assert.equal(closed, false);
      release.resolve();
      assert.equal(await running, 7);
      await closing;
      assert.equal(closed, true);
    } finally {
      release.resolve();
      await running;
      await (closing ?? f.close());
    }
  }
);
test('settings reject malformed values and retain acknowledged values after a rejected flush', async () => {
  const { store } = offlineVkPolicy(createVkSendQueueApi);
  await saveVkSendQueue(store, { enabled: true });
  for (const input of [
    { enabled: 'true' },
    { markRead: 1 },
    { charsPerMinute: 3001 },
    { charsPerMinute: 60.5 },
  ]) {
    await assert.rejects(saveVkSendQueue(store, input));
  }
  store.flush = async () => {
    throw new Error('Synthetic queue flush refusal');
  };
  await assert.rejects(saveVkSendQueue(store, { enabled: false }));
  assert.equal((await loadVkSendQueue(store)).settings.enabled, true);
});
