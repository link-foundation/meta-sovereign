import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { vkMessageLink, createVkLive } from '../../js/src/sources/vk.js';
import { saveGreetingSelection } from '../../js/src/greetings/plan.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';

export const greetingPhrases = ['Hello <friend> & 👋', 'Hi from my catalog'];
export const seedVkGreetings = async () => {
  const store = createMemoryStore();
  const raw = (id, peer, text, extra = {}) => ({
    id,
    peer_id: peer,
    from_id: peer,
    text,
    date: Math.floor(Date.now() / 1000) - 60 + id,
    ...extra,
  });
  for (const msg of [
    raw(1, 41, 'Hello!'),
    raw(2, 42, '', {
      attachments: [{ type: 'sticker', sticker: { sticker_id: 72789 } }],
    }),
    raw(3, 43, 'Hello!', { from_id: 1, out: 1 }),
    raw(4, 2000000001, 'Hello!', { from_id: 44 }),
    raw(5, -55, 'Hello!'),
  ]) {
    await store.put(vkMessageLink(msg));
  }
  await saveGreetingSelection(store, { prefer: 'text', language: 'en' });
  await store.put({
    id: 'secret:vk:token',
    value: 'fixture-vk-token',
    tokens: [],
  });
  return store;
};

export const vkGreetingCatalogServer = async () => {
  const store = await seedVkGreetings();
  const vk = createFakeVk({ methods: { 'messages.send': () => 909 } });
  const live = createVkLive({ fetchImpl: vk.fetchImpl, baseUrl: vk.baseUrl });
  const server = await startServer({
    store,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    greetings: {
      resolveSource: () => ({ live }),
      sleep: async () => {},
      random: () => 0,
    },
    log: null,
  });
  return {
    store,
    vk,
    base: `http://127.0.0.1:${server.port}`,
    close: () => server.close(),
    stats: () => ({ sends: vk.calls.length, liveProvider: false }),
  };
};
