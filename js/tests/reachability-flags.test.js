// R-Z7: the flags the autopilot's planner reads (bot, blocked, left,
// deletedAccount, chatType 'channel') are written by the adapters that can
// tell, so the planner really skips those chats.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { createVkLive, vkReachability } from '../src/sources/vk.js';
import { unreachableReason } from '../src/automation/safety.js';

const message = { id: 1, message: 'hi', date: 1_700_000_000 };
const linksOf = (dialog) => telegramDialogLinks(dialog, [message]);

test('Telegram: a bot, a deleted account and a left chat are flagged', () => {
  const bot = linksOf({ id: 5, isUser: true, entity: { bot: true } });
  assert.equal(bot[0].bot, true);
  assert.equal(unreachableReason(bot), 'bot');

  const gone = linksOf({ id: 6, isUser: true, entity: { deleted: true } });
  assert.equal(gone[0].deletedAccount, true);
  assert.equal(unreachableReason(gone), 'deleted-account');

  const left = linksOf({
    id: -100123,
    isChannel: true,
    isGroup: true,
    entity: { left: true },
  });
  assert.equal(left[0].left, true);
  assert.equal(unreachableReason(left), 'left');
});

test('Telegram: a channel is a channel and a normal chat has no flag', () => {
  const channel = linksOf({ id: -100456, isChannel: true, entity: {} });
  assert.equal(channel[0].chatType, 'channel');
  assert.equal(unreachableReason(channel), 'channel');
  const plain = linksOf({ id: 7, isUser: true, entity: { firstName: 'Ann' } });
  for (const flag of ['bot', 'blocked', 'left', 'deletedAccount']) {
    assert.equal(flag in plain[0], false);
  }
  assert.equal(unreachableReason(plain), null);
});

test('VK: the conversation says blocked, left or a deleted account', () => {
  const item = (conversation) => ({ conversation });
  assert.deepEqual(
    vkReachability(item({ can_write: { allowed: false, reason: 900 } })),
    { blocked: true }
  );
  assert.deepEqual(
    vkReachability(item({ can_write: { allowed: false, reason: 901 } })),
    { blocked: true }
  );
  assert.deepEqual(
    vkReachability(item({ can_write: { allowed: false, reason: 18 } })),
    { blocked: true }
  );
  assert.deepEqual(
    vkReachability(item({ can_write: { allowed: false, reason: 18 } }), {
      deactivated: true,
    }),
    { deletedAccount: true }
  );
  assert.deepEqual(
    vkReachability(item({ chat_settings: { state: 'kicked' } })),
    { left: true }
  );
  assert.deepEqual(
    vkReachability(
      item({ can_write: { allowed: true }, chat_settings: { state: 'in' } })
    ),
    {}
  );
  assert.deepEqual(vkReachability(null), {});
});

test('VK: a pulled conversation carries the flags on its message link', async () => {
  const live = createVkLive({
    token: 't',
    fetchImpl: async () =>
      new globalThis.Response(
        JSON.stringify({
          response: {
            items: [
              {
                conversation: {
                  peer: { id: 55, type: 'user' },
                  can_write: { allowed: false, reason: 900 },
                },
                last_message: {
                  id: 9,
                  from_id: 55,
                  peer_id: 55,
                  date: 1_700_000_000,
                  text: 'bye',
                },
              },
            ],
            profiles: [{ id: 55, first_name: 'Ivan', last_name: 'P' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ),
  });
  const { links } = await live.pullMessages({ count: 1 });
  assert.equal(links[0].blocked, true);
  assert.equal(unreachableReason(links), 'blocked');
});
