// A group message read raw (an update, a channel's difference) names its
// author in `fromId` only; it is stored with that author, never with the
// chat as its sender, and messages stored that way before are repaired.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { repairSenders } from '../src/sources/telegram-repair.js';
import { messageSenderId } from '../src/sources/telegram-updates.js';

const GROUP = '-1001234';

const fakeStore = (links = []) => {
  const byId = new Map(links.map((l) => [l.id, l]));
  return {
    byId,
    get: async (id) => byId.get(id) ?? null,
    put: async (link) => {
      byId.set(link.id, link);
    },
    query: async (filter = () => true) => [...byId.values()].filter(filter),
  };
};

test('a raw message is written by its fromId, a built one by senderId', () => {
  assert.equal(
    messageSenderId({ fromId: { className: 'PeerUser', userId: 42n } }),
    '42'
  );
  assert.equal(messageSenderId({ fromId: { channelId: '77' } }), '-10077');
  assert.equal(messageSenderId({ senderId: { value: 9n }, fromId: null }), '9');
  assert.equal(messageSenderId({}), null);

  const dialog = { id: GROUP, isChannel: true, isGroup: true, title: 'G' };
  const [link] = telegramDialogLinks(dialog, [
    {
      id: 5,
      message: 'hi',
      date: 1_760_000_000,
      fromId: { className: 'PeerUser', userId: '42' },
    },
  ]);
  assert.equal(link.sender, '42');
  // A private chat's incoming message has no fromId: its other side.
  const [own] = telegramDialogLinks({ id: '42', isUser: true, name: 'A' }, [
    { id: 6, message: 'yo', date: 1_760_000_000 },
  ]);
  assert.equal(own.sender, '42');
});

test('messages stored with their chat as sender are repaired once', async () => {
  const msg = (id, extra) => ({
    id: `msg:telegram:${GROUP}:${id}`,
    source: 'telegram',
    chat: GROUP,
    chatType: 'group',
    body: 'x',
    ...extra,
  });
  const store = fakeStore([
    msg(1, { sender: '42', senderName: 'Oleg' }),
    msg(2, { sender: GROUP, raw: { fromId: { userId: '42' } } }),
    msg(3, { sender: GROUP, raw: { fromId: { userId: '43' } } }),
    // A channel's own post: its sender is the channel, as it should be.
    msg(4, { sender: GROUP, raw: { fromId: { channelId: '1234' } } }),
    msg(5, { sender: GROUP, raw: {} }),
    { id: 'person:telegram:43', source: 'telegram', user: '43', name: 'Eve' },
  ]);
  const events = [];
  assert.equal(await repairSenders(store, { log: (e) => events.push(e) }), 2);
  const get = (id) => store.byId.get(`msg:telegram:${GROUP}:${id}`);
  assert.deepEqual([get(2).sender, get(2).senderName], ['42', 'Oleg']);
  assert.deepEqual([get(3).sender, get(3).senderName], ['43', 'Eve']);
  assert.equal(get(4).sender, GROUP);
  assert.equal(get(5).sender, GROUP);
  assert.equal(events[0].event, 'telegram_repair_senders');
  assert.equal(events[0].fixed, 2);
  // Ran: the marker keeps it from running again.
  store.byId.set(get(2).id, { ...get(2), sender: GROUP });
  assert.equal(await repairSenders(store), 0);
});
