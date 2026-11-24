import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createVkCache } from '../../js/src/sources/vk-cache.js';
import { startServer } from '../../js/src/server/index.js';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

export const cacheInput = {
  accountId: 1,
  peerId: 42,
  kind: 'history',
  maxPages: 1,
};
export const cacheFixture = ({
  count = 401,
  store = createMemoryStore(),
} = {}) => {
  let account = 1;
  let token = 'fixture-cache-token';
  let hook;
  const calls = [];
  const history = Array.from({ length: count }, (_, i) => ({
    id: count - i,
    peer_id: 42,
    from_id: i % 2 ? 1 : 42,
    out: i % 2,
    date: 1700000000 + count - i,
    text: `Cached message ${count - i}`,
    ...(i === 0
      ? {
          reply_message: { id: 1, text: 'Original\nquoted reply' },
          attachments: [{ type: 'photo', photo: { id: 9, owner_id: 42 } }],
        }
      : {}),
  }));
  const live = createVkLive({
    limiter: { wait: async () => {} },
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const method = new URL(url).pathname.split('/').at(-1);
      const params = Object.fromEntries(new URLSearchParams(options.body));
      calls.push({ method, ...params, access_token: '<redacted>' });
      let response = await hook?.(method, params, calls.length);
      if (response === undefined) {
        if (method === 'users.get') {
          response = params.user_ids
            ? [
                {
                  id: Number(params.user_ids),
                  first_name: 'Cached friend',
                  online: 0,
                },
              ]
            : [{ id: account }];
        } else if (method === 'messages.getHistory') {
          response = {
            count: history.length,
            items: history.slice(
              Number(params.offset),
              Number(params.offset) + Number(params.count)
            ),
          };
        } else if (method === 'messages.getConversationsById') {
          response = {
            count: 1,
            items: [
              {
                peer: { id: Number(params.peer_ids), type: 'user' },
                unread_count: 0,
              },
            ],
          };
        } else if (method === 'friends.get') {
          response = params.user_id
            ? { count: 0, items: [] }
            : {
                count: 2,
                items: [
                  { id: 42, first_name: 'A' },
                  { id: 43, first_name: 'B' },
                ],
              };
        } else {
          throw new Error(`Unexpected provider write or read: ${method}`);
        }
      }
      return new globalThis.Response(JSON.stringify({ response }));
    },
  });
  const options = {
    source: () => ({ live }),
    optionsFor: async () => ({ token }),
    now: () => 1794750000000,
  };
  return {
    store,
    options,
    service: createVkCache({ store, ...options }),
    history,
    calls,
    hook: (value) => {
      hook = value;
    },
    account: (value) => {
      account = value;
    },
    token: (value) => {
      token = value;
    },
  };
};
export const cacheServer = async () => {
  const fixture = cacheFixture();
  const folder = await mkdtemp(path.join(os.tmpdir(), 'ms-vk-cache-'));
  let messages = 0;
  const server = await startServer({
    store: fixture.store,
    storeDir: path.join(folder, 'store'),
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      vkCache: fixture.options,
      send: async () => {
        messages++;
        throw new Error('Unexpected fixture message');
      },
    },
    log: null,
  });
  return {
    ...fixture,
    base: `http://127.0.0.1:${server.port}`,
    folder,
    stats: () => ({
      syntheticReads: fixture.calls.length,
      messages,
      liveProvider: false,
    }),
    close: async () => {
      await server.close();
      await rm(folder, { recursive: true, force: true });
    },
  };
};
if (process.argv.includes('--vk-cache')) {
  const fixture = await cacheServer();
  console.log(JSON.stringify({ exportRoot: fixture.folder }));
  serveQuestionLinkFixture(fixture);
}
