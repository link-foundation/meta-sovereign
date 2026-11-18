import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { vkOutgoingFor } from '../../js/src/automation/vk-outgoing-queue.js';
import { guardedSend } from '../../js/src/automation/outbox.js';
import { saveVkOutgoingSettings } from '../../js/src/automation/vk-outgoing-settings.js';
import { startServer } from '../../js/src/server/index.js';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

export const queueFixture = ({ store = createMemoryStore() } = {}) => {
  let time = Date.parse('2026-11-15T12:00:00Z');
  let hook;
  const calls = [];
  const sleeps = [];
  const now = () => time;
  const sleep = async (ms, signal) => {
    sleeps.push(ms);
    await hook?.(ms, signal);
    time += ms;
  };
  const live = createVkLive({
    limiter: { wait: async () => {} },
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split('/').at(-1);
      const params = Object.fromEntries(new URLSearchParams(options.body));
      delete params.access_token;
      calls.push({ method, at: now(), ...params });
      return new globalThis.Response(
        JSON.stringify({
          response: method === 'messages.send' ? 1000 + calls.length : 1,
        })
      );
    },
  });
  const queue = vkOutgoingFor(store, { now, sleep, random: () => 0 });
  const options = { token: 'fixture-queue-token' };
  const submit = (
    key,
    draft = { source: 'vk', chat: '7', text: 'x'.repeat(450) }
  ) =>
    queue.run(
      {
        key,
        draft,
        markRead: () => live.markRead({ chat: draft.chat, id: 21 }, options),
        setTyping: () => live.setTyping({ chat: draft.chat }, options),
      },
      () =>
        guardedSend({
          store,
          key,
          kind: 'queue-fixture',
          draft,
          clock: () => new Date(now()),
          send: async (outgoing) => ({
            via: 'api',
            result: await live.post(outgoing, options),
          }),
        })
    );
  return {
    store,
    now,
    sleep,
    queue,
    submit,
    calls,
    sleeps,
    live,
    options,
    hook: (next) => {
      hook = next;
    },
    enable: () => saveVkOutgoingSettings(store, { enabled: true }),
  };
};

export const queueServer = async () => {
  const store = createMemoryStore();
  const folder = await mkdtemp(path.join(os.tmpdir(), 'ms-vk-queue-'));
  let refuse = false;
  store.flush = async () => {
    if (refuse) {
      throw new Error('Synthetic queue write refusal');
    }
  };
  const server = await startServer({
    store,
    storeDir: folder,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      vkQueue: {
        sleep: (...args) => fixture.sleep(...args),
        now: () => fixture.now(),
        random: () => 0,
      },
      send: async () => {
        throw new Error('Unexpected server send');
      },
    },
    log: null,
  });
  const fixture = queueFixture({ store: server.store });
  return {
    ...fixture,
    folder,
    base: `http://127.0.0.1:${server.port}`,
    stats: () => ({
      syntheticCalls: fixture.calls.length,
      messages: fixture.calls.filter((call) => call.method === 'messages.send')
        .length,
      liveProvider: false,
    }),
    refuseWrites: (value) => {
      refuse = value;
    },
    close: async () => {
      await server.close();
      await fixture.queue.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
};
if (process.argv.includes('--vk-queue')) {
  const fixture = await queueServer();
  if (process.argv.includes('--receipts')) {
    await fixture.enable();
    await fixture.submit('mcp-receipt', {
      source: 'vk',
      chat: '7',
      text: 'Fixture queue receipt',
    });
  }
  serveQuestionLinkFixture(fixture);
}
