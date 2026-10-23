// A channel's info carries its linked monoforum and keeps the monoforum's
// peer so the chat can be opened (R-Y191). Fake client; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChatInfoReader } from '../src/sources/telegram-chat-info.js';
import { helpers, named } from './helpers/telegram-fakes.mjs';

test('the channel info carries the monoforum and keeps its peer', async () => {
  const remembered = [];
  const reader = createChatInfoReader({
    queue: { run: async (_k, _p, fn) => fn() },
    client: async () => ({
      invoke: async (r) =>
        r.className === 'GetFullChannel'
          ? {
              fullChat: { id: 1n, participantsCount: 5 },
              // The monoforum may be listed before the channel itself.
              chats: [
                { id: 9n, accessHash: 3n, title: 'DM', monoforum: true },
                {
                  id: 1n,
                  title: 'C',
                  broadcast: true,
                  linkedMonoforumId: 9n,
                  adminRights: { manageDirectMessages: true },
                },
              ],
            }
          : { onlines: 1 },
    }),
    peers: {
      input: async () => ({ className: 'InputPeerChannel' }),
      remember: async (chat, entity) => remembered.push([chat, entity.id]),
    },
    importer: async () => ({
      Api: {
        channels: { GetFullChannel: named('GetFullChannel') },
        messages: { GetOnlines: named('GetOnlines') },
      },
      helpers,
    }),
  });
  const got = await reader.read({ chat: '-1001' });
  assert.equal(got.title, 'C');
  assert.deepEqual(got.monoforum, {
    id: '-1009',
    title: 'DM',
    price: 0,
    allowed: false,
    admin: true,
  });
  assert.deepEqual(remembered, [['-1009', 9n]]);
});

test('a channel without a monoforum has none in its info', async () => {
  const reader = createChatInfoReader({
    queue: { run: async (_k, _p, fn) => fn() },
    client: async () => ({
      invoke: async (r) =>
        r.className === 'GetFullChannel'
          ? {
              fullChat: { id: 1n },
              chats: [{ id: 1n, title: 'C', broadcast: true }],
            }
          : { onlines: 0 },
    }),
    peers: { input: async () => ({ className: 'InputPeerChannel' }) },
    importer: async () => ({
      Api: {
        channels: { GetFullChannel: named('GetFullChannel') },
        messages: { GetOnlines: named('GetOnlines') },
      },
      helpers,
    }),
  });
  assert.equal((await reader.read({ chat: '-1001' })).monoforum, undefined);
});
