import test from 'node:test';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setImmediate as turn } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import { automationPresets } from '../src/automation/automations.js';
import { peerTriggerId } from '../src/automation/trigger-state.js';
import { startServer } from '../src/server/index.js';

test(
  'server close drains an admitted live trigger before its final flush',
  { timeout: 15000 },
  async (t) => {
    const folder = await fs.mkdtemp(
      path.join(os.tmpdir(), 'automation-drain-')
    );
    const store = createMemoryStore();
    const automation = {
      ...automationPresets().find((row) => row.id === 'automation:greet-back'),
      enabled: true,
    };
    await store.put(automation);
    const admitted = Promise.withResolvers();
    const release = Promise.withResolvers();
    const get = store.get.bind(store);
    let armed = false;
    store.get = async (id) => {
      if (armed && id === automation.id) {
        armed = false;
        admitted.resolve();
        await release.promise;
      }
      return get(id);
    };
    const message = {
      id: 'msg:vk:drain',
      source: 'vk',
      chat: '7',
      sender: '7',
      body: 'hello',
      timestamp: new Date(Date.now() + 1000).toISOString(),
    };
    let handle;
    let closing;
    const state = { flushed: false };
    store.flush = async () => {
      state.flushed = true;
    };
    try {
      handle = await startServer({
        store,
        storeDir: folder,
        enableHandlers: false,
        enableSync: false,
        telegramAccount: false,
        automations: {
          send: async () => {
            throw new Error('unexpected provider send');
          },
        },
      });
      armed = true;
      message.timestamp = new Date().toISOString();
      await handle.store.put(message);
      await Promise.race([
        admitted.promise,
        once(t.signal, 'abort').then(() => {
          throw new Error('test aborted before admission');
        }),
      ]);
      state.flushed = false;
      let closed = false;
      closing = handle.close().then(() => {
        closed = true;
      });
      await turn();
      assert.equal(closed, false);
      assert.equal(state.flushed, false);
      release.resolve();
      await closing;
      assert.ok(await store.get(peerTriggerId(automation, message)));
      assert.equal(state.flushed, true);
    } finally {
      release.resolve();
      await (closing ?? handle?.close());
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
);
