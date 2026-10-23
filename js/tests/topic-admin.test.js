// Managing a forum's topics (R-Y153): the requests built, Telegram's errors
// as codes, the routes' validation, and the page's rights and menus. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTopicAdmin } from '../src/sources/telegram-topic-admin.js';
import { topicRightsIn } from '../src/sources/telegram-chat-info.js';
import {
  editBody,
  topicClosedFor,
  topicMenuItems,
  topicRequest,
} from '../src/web/chat-topic-admin.js';
import { shownTopics } from '../src/web/chat-topics.js';
import { named, telegramError, post } from './helpers/telegram-fakes.mjs';

const Api = {
  messages: {
    GetStickerSet: named('messages.GetStickerSet'),
    CreateForumTopic: named('messages.CreateForumTopic'),
    EditForumTopic: named('messages.EditForumTopic'),
    UpdatePinnedForumTopic: named('messages.UpdatePinnedForumTopic'),
    DeleteTopicHistory: named('messages.DeleteTopicHistory'),
  },
  channels: { ToggleForum: named('channels.ToggleForum') },
  InputStickerSetEmojiDefaultTopicIcons: named(
    'InputStickerSetEmojiDefaultTopicIcons'
  ),
};

const make = (answer = () => ({})) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request, log);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({
      Api,
      helpers: {
        returnBigInt: (v) => BigInt(v),
        readBigIntFromBuffer: (bytes) => BigInt(bytes.length),
      },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  return {
    actions: createTopicAdmin(env, { userClient: async () => client }),
    log,
  };
};

const CHAT = '-1005';

test('icons: the emoji of the default topic icon stickers', async () => {
  const { actions, log } = make(() => ({
    documents: [
      { id: 11n, attributes: [{ alt: '💡' }] },
      { id: 12n, attributes: [] },
      { id: 13n, attributes: [{ alt: '🎉' }] },
    ],
  }));
  const answer = await actions.topicIcons();
  assert.deepEqual(answer.icons, [
    { id: '11', emoji: '💡' },
    { id: '13', emoji: '🎉' },
  ]);
  assert.equal(
    log[0].stickerset.className,
    'InputStickerSetEmojiDefaultTopicIcons'
  );
});

test('create: title, colour, icon and a random id', async () => {
  const { actions, log } = make();
  const answer = await actions.createTopic({
    chat: CHAT,
    title: '  Plans ',
    iconColor: 0xffd67e,
    iconEmojiId: '11',
  });
  assert.equal(answer.ok, true);
  const [request] = log;
  assert.equal(request.className, 'messages.CreateForumTopic');
  assert.equal(request.title, 'Plans');
  assert.equal(request.iconColor, 0xffd67e);
  assert.equal(request.iconEmojiId, 11n);
  assert.equal(typeof request.randomId, 'bigint');
  assert.deepEqual(request.peer, { chat: CHAT });
  // Without an icon, none is sent.
  await actions.createTopic({ chat: CHAT, title: 'B', iconColor: 0x6fb9f0 });
  assert.equal('iconEmojiId' in log[1], false);
});

test('create: bad input never reaches Telegram', async () => {
  const { actions, log } = make();
  const bads = [
    { chat: '-5', title: 'x', iconColor: 0x6fb9f0 },
    { chat: CHAT, title: ' ', iconColor: 0x6fb9f0 },
    { chat: CHAT, title: 'x'.repeat(129), iconColor: 0x6fb9f0 },
    { chat: CHAT, title: 'x', iconColor: 0x123456 },
    { chat: CHAT, title: 'x', iconColor: 0x6fb9f0, iconEmojiId: 'abc' },
  ];
  for (const body of bads) {
    assert.equal((await actions.createTopic(body)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test('edit: only what is named; icon 0 takes it off', async () => {
  const { actions, log } = make();
  await actions.editTopic({ chat: CHAT, topic: 7, title: 'New', closed: true });
  assert.equal(log[0].className, 'messages.EditForumTopic');
  assert.equal(log[0].topicId, 7);
  assert.equal(log[0].title, 'New');
  assert.equal(log[0].closed, true);
  assert.equal('hidden' in log[0], false);
  assert.equal('iconEmojiId' in log[0], false);
  await actions.editTopic({ chat: CHAT, topic: 7, iconEmojiId: '0' });
  assert.equal(log[1].iconEmojiId, 0n);
  assert.equal(
    (await actions.editTopic({ chat: CHAT, topic: 7 })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.editTopic({ chat: CHAT, topic: 7, closed: 'yes' })).code,
    'bad-request'
  );
});

test('pin and unpin', async () => {
  const { actions, log } = make();
  await actions.pinTopic({ chat: CHAT, topic: 7, pinned: true });
  assert.equal(log[0].className, 'messages.UpdatePinnedForumTopic');
  assert.equal(log[0].pinned, true);
  assert.equal(
    (await actions.pinTopic({ chat: CHAT, topic: 7 })).code,
    'bad-request'
  );
});

test('delete: asked again while Telegram has more; never General', async () => {
  let left = 2;
  const { actions, log } = make(() => ({ offset: left-- > 0 ? 5 : 0 }));
  const answer = await actions.deleteTopic({ chat: CHAT, topic: 9 });
  assert.equal(answer.ok, true);
  assert.equal(log.length, 3);
  assert.equal(log[0].className, 'messages.DeleteTopicHistory');
  assert.equal(log[0].topMsgId, 9);
  assert.equal(
    (await actions.deleteTopic({ chat: CHAT, topic: 1 })).code,
    'bad-request'
  );
  assert.equal(log.length, 3);
});

test('forum toggle sends tabs off', async () => {
  const { actions, log } = make();
  await actions.toggleForum({ chat: CHAT, enabled: true });
  assert.equal(log[0].className, 'channels.ToggleForum');
  assert.equal(log[0].enabled, true);
  assert.equal(log[0].tabs, false);
  assert.equal(
    (await actions.toggleForum({ chat: '12', enabled: true })).code,
    'bad-request'
  );
});

test("Telegram's errors become codes; nothing to change is no failure", async () => {
  const fail = (name) => make(() => telegramError(name)).actions;
  assert.equal(
    (
      await fail('CHAT_ADMIN_REQUIRED').pinTopic({
        chat: CHAT,
        topic: 2,
        pinned: true,
      })
    ).code,
    'not-admin'
  );
  assert.equal(
    (await fail('TOPIC_ID_INVALID').deleteTopic({ chat: CHAT, topic: 2 })).code,
    'no-topic'
  );
  const same = await fail('TOPIC_NOT_MODIFIED').editTopic({
    chat: CHAT,
    topic: 2,
    closed: true,
  });
  assert.deepEqual(same, { ok: true });
});

test('routes validate before the account is asked', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  const ok = { chat: CHAT, topic: 7 };
  const cases = [
    ['topic-create', { chat: CHAT, title: 'A', iconColor: 0x6fb9f0 }, 200],
    ['topic-create', { chat: CHAT, title: 'A', iconColor: 5 }, 400],
    ['topic-create', { chat: '12', title: 'A', iconColor: 0x6fb9f0 }, 400],
    ['topic-create', { chat: CHAT, title: '', iconColor: 0x6fb9f0 }, 400],
    ['topic-edit', { ...ok, title: 'B' }, 200],
    ['topic-edit', ok, 400],
    ['topic-edit', { ...ok, hidden: 1 }, 400],
    ['topic-edit', { ...ok, topic: '7', closed: true }, 400],
    ['topic-pin', { ...ok, pinned: false }, 200],
    ['topic-pin', ok, 400],
    ['topic-delete', ok, 200],
    ['topic-delete', { ...ok, topic: 1 }, 400],
    ['forum-toggle', { chat: CHAT, enabled: false }, 200],
    ['forum-toggle', { chat: CHAT }, 400],
    ['topic-icons', {}, 200],
  ];
  for (const [route, body, status] of cases) {
    const got = await post(route, body, account);
    assert.equal(got.status, status, `${route} ${JSON.stringify(body)}`);
  }
  assert.equal(calls.length, cases.filter((c) => c[2] === 200).length);
});

test("the user's rights over topics, as Desktop decides", () => {
  assert.deepEqual(topicRightsIn({ creator: true }), {
    manage: true,
    create: true,
    delete: true,
  });
  const admin = topicRightsIn({ adminRights: { manageTopics: true } });
  assert.equal(admin.manage, true);
  assert.equal(admin.delete, false);
  assert.equal(
    topicRightsIn({ adminRights: { deleteMessages: true } }).delete,
    true
  );
  // A member may create unless the group or they are barred.
  assert.equal(topicRightsIn({ defaultBannedRights: {} }).create, true);
  assert.equal(
    topicRightsIn({ defaultBannedRights: { manageTopics: true } }).create,
    false
  );
  assert.equal(
    topicRightsIn({ bannedRights: { manageTopics: true } }).create,
    false
  );
  assert.equal(
    topicRightsIn({
      defaultBannedRights: { manageTopics: true },
      creator: true,
    }).create,
    true
  );
});

test("a topic's menu offers what the rights allow", () => {
  const admin = { topics: { manage: true, create: true, delete: true } };
  const member = { topics: { manage: false, create: true, delete: false } };
  const topic = { id: 7, title: 'T', pinned: false, closed: false };
  assert.deepEqual(topicMenuItems(topic, admin), [
    'pinTopic',
    'editTopic',
    'closeTopic',
    'deleteTopic',
  ]);
  assert.deepEqual(
    topicMenuItems({ ...topic, pinned: true, closed: true }, admin),
    ['unpinTopic', 'editTopic', 'reopenTopic', 'deleteTopic']
  );
  assert.deepEqual(topicMenuItems(topic, member), []);
  // Its creator edits and closes their own.
  assert.deepEqual(topicMenuItems({ ...topic, mine: true }, member), [
    'editTopic',
    'closeTopic',
  ]);
  // General: close and hide only, and only for those who manage.
  const general = { id: 1, title: 'General', hidden: false, closed: false };
  assert.deepEqual(topicMenuItems(general, admin), ['closeTopic', 'hideTopic']);
  assert.deepEqual(topicMenuItems({ ...general, hidden: true }, admin), [
    'closeTopic',
    'showTopic',
  ]);
  assert.deepEqual(topicMenuItems(general, member), []);
  assert.deepEqual(topicMenuItems(topic, null), []);
});

test('requests, edits and the closed composer', () => {
  const topic = { id: 7, title: 'Old', iconEmojiId: '5' };
  assert.deepEqual(topicRequest('closeTopic', CHAT, topic), {
    method: 'telegramTopicEdit',
    body: { chat: CHAT, topic: 7, closed: true },
  });
  assert.deepEqual(topicRequest('unpinTopic', CHAT, topic).body, {
    chat: CHAT,
    topic: 7,
    pinned: false,
  });
  assert.equal(topicRequest('editTopic', CHAT, topic), null);
  assert.equal(editBody(CHAT, topic, { title: 'Old ', icon: '5' }), null);
  assert.deepEqual(editBody(CHAT, topic, { title: 'New', icon: '0' }), {
    chat: CHAT,
    topic: 7,
    title: 'New',
    iconEmojiId: '0',
  });
  const admin = { topics: { manage: true } };
  assert.equal(topicClosedFor({ closed: true }, null), true);
  assert.equal(topicClosedFor({ closed: true }, admin), false);
  assert.equal(topicClosedFor({ closed: false }, null), false);
  assert.equal(topicClosedFor(null, null), false);
});

test('a hidden General shows to managers, or while open', () => {
  const list = [{ id: 1, hidden: true }, { id: 2 }];
  const admin = { topics: { manage: true } };
  assert.equal(shownTopics(list, null, null).length, 1);
  assert.equal(shownTopics(list, null, admin).length, 2);
  assert.equal(shownTopics(list, 1, null).length, 2);
});
