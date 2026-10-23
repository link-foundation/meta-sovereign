// Story interactions (R-Y148): a private reply with the story as its
// reply-to, a reaction sent or taken back, the viewers 50 at a time,
// deleting, hiding; Telegram's errors as codes; the routes' validation;
// the pure helpers the page uses. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStoryActions } from '../src/sources/telegram-story-actions.js';
import { createStories } from '../src/sources/telegram-stories.js';
import {
  LIKE,
  STORY_REACTIONS,
  hiddenPeers,
  joinViews,
  reactionAfter,
  ringOf,
  setHidden,
  visiblePeers,
} from '../src/web/stories-model.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputReplyToStory: named('InputReplyToStory'),
  ReactionEmoji: named('ReactionEmoji'),
  ReactionEmpty: named('ReactionEmpty'),
  messages: { SendMessage: named('SendMessage') },
  stories: {
    SendReaction: named('SendReaction'),
    GetStoryViewsList: named('GetStoryViewsList'),
    DeleteStories: named('DeleteStories'),
    TogglePeerStoriesHidden: named('TogglePeerStoriesHidden'),
    GetAllStories: named('GetAllStories'),
  },
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({
      Api,
      helpers: {
        ...helpers,
        readBigIntFromBuffer: (bytes) => BigInt(bytes.length),
      },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ peer: chat }) },
  };
  const context = { userClient: async () => client };
  return {
    actions: { ...createStoryActions(env, context) },
    stories: createStories(env, context),
    log,
  };
};

test('a reply is a message that replies to the story', async () => {
  const { actions, log } = make(() => ({}));
  assert.deepEqual(
    await actions.storyReply({ chat: '42', id: 7, text: ' hi there ' }),
    { ok: true }
  );
  const [request] = log;
  assert.equal(request.className, 'SendMessage');
  assert.equal(request.message, 'hi there');
  assert.equal(request.peer.peer, '42');
  assert.equal(request.replyTo.className, 'InputReplyToStory');
  assert.equal(request.replyTo.storyId, 7);
  assert.equal(request.replyTo.peer.peer, '42');
  assert.ok(request.randomId !== undefined);
});

test('bad replies never reach Telegram', async () => {
  const { actions, log } = make(() => ({}));
  for (const request of [
    { chat: 'x', id: 7, text: 'a' },
    { chat: '42', id: 0, text: 'a' },
    { chat: '42', id: 7, text: '   ' },
    { chat: '42', id: 7, text: 'a'.repeat(4097) },
    { chat: '42', id: 7 },
  ]) {
    assert.equal((await actions.storyReply(request)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('a reaction is an emoji; an empty one takes it back', async () => {
  const { actions, log } = make(() => ({}));
  assert.deepEqual(
    await actions.storyReact({ chat: '42', id: 7, reaction: '❤' }),
    { ok: true, reaction: '❤' }
  );
  assert.equal(log[0].className, 'SendReaction');
  assert.equal(log[0].storyId, 7);
  assert.equal(log[0].reaction.className, 'ReactionEmoji');
  assert.equal(log[0].reaction.emoticon, '❤');
  assert.equal(log[0].addToRecent, true);
  await actions.storyReact({ chat: '42', id: 7, reaction: '' });
  assert.equal(log[1].reaction.className, 'ReactionEmpty');
  assert.equal(log[1].addToRecent, undefined);
  for (const reaction of ['a b', 5, undefined, 'x'.repeat(30)]) {
    assert.equal(
      (await actions.storyReact({ chat: '42', id: 7, reaction })).ok,
      false
    );
  }
  assert.equal(log.length, 2);
});

test('the viewers come 50 at a time, with their reactions', async () => {
  const answer = {
    count: 120,
    viewsCount: 120,
    reactionsCount: 3,
    nextOffset: 'OFF1',
    users: [
      { id: 5n, firstName: 'Ann', lastName: 'Lee' },
      { id: 6n, username: 'bob' },
    ],
    views: [
      {
        className: 'StoryView',
        userId: 5n,
        date: 100,
        reaction: { className: 'ReactionEmoji', emoticon: '🔥' },
      },
      { className: 'StoryView', userId: 6n, date: 90 },
      { className: 'StoryViewPublicForward' },
    ],
  };
  const { actions, log } = make(() => answer);
  const got = await actions.storyViews({ chat: '7', id: 3 });
  assert.equal(log[0].limit, 50);
  assert.equal(log[0].offset, '');
  assert.equal(log[0].id, 3);
  assert.equal(got.next, 'OFF1');
  assert.equal(got.viewsCount, 120);
  assert.deepEqual(got.views, [
    { user: '5', name: 'Ann Lee', date: 100, reaction: '🔥' },
    { user: '6', name: 'bob', date: 90, reaction: '' },
  ]);
  await actions.storyViews({ chat: '7', id: 3, offset: 'OFF1' });
  assert.equal(log[1].offset, 'OFF1');
  assert.equal(
    (await actions.storyViews({ chat: '7', id: 3, offset: '<x>' })).ok,
    false
  );
});

test('delete and hide send the peer and the story', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.storyDelete({ chat: '7', id: 3 }), {
    ok: true,
  });
  assert.equal(log[0].className, 'DeleteStories');
  assert.deepEqual(log[0].id, [3]);
  assert.deepEqual(await actions.storiesHide({ chat: '42', hidden: true }), {
    ok: true,
    hidden: true,
  });
  assert.equal(log[1].className, 'TogglePeerStoriesHidden');
  assert.equal(log[1].hidden, true);
  assert.equal(
    (await actions.storiesHide({ chat: '42', hidden: 'yes' })).ok,
    false
  );
});

test("Telegram's errors become codes", async () => {
  const { actions } = make(() => telegramError('STORY_ID_INVALID'));
  assert.equal((await actions.storyDelete({ chat: '7', id: 3 })).code, 'gone');
  const flood = make(() => telegramError('FLOOD_WAIT_5'));
  assert.equal(
    (await flood.actions.storyReact({ chat: '7', id: 3, reaction: '❤' })).code,
    'flood'
  );
  const bad = make(() => telegramError('REACTION_INVALID'));
  assert.equal(
    (await bad.actions.storyReact({ chat: '7', id: 3, reaction: '❤' })).code,
    'bad-reaction'
  );
});

test('the strip asks for the hidden stories, and a story carries its views', async () => {
  const { stories, log } = make(() => ({
    className: 'stories.AllStories',
    hasMore: false,
    state: 'S',
    users: [{ id: 42n, firstName: 'Ann' }],
    chats: [],
    peerStories: [],
  }));
  await stories.stories({ hidden: true });
  assert.equal(log[0].hidden, true);
  await stories.stories({});
  assert.equal(log[1].hidden, false);
});

test('the routes validate their bodies', async () => {
  const calls = [];
  const spy = (name) => async (r) => calls.push([name, r]) && { ok: true };
  const account = {
    storyReply: spy('reply'),
    storyReact: spy('react'),
    storyViews: spy('views'),
    storyDelete: spy('delete'),
    storiesHide: spy('hide'),
    stories: spy('stories'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('story-reply', { chat: '42', id: 3, text: 'a' }),
    200
  );
  assert.equal(
    await status('story-reply', { chat: '42', id: 3, text: ' ' }),
    400
  );
  assert.equal(
    await status('story-reply', { chat: '42', id: '3', text: 'a' }),
    400
  );
  assert.equal(
    await status('story-react', { chat: '42', id: 3, reaction: '' }),
    200
  );
  assert.equal(await status('story-react', { chat: '42', id: 3 }), 400);
  assert.equal(await status('story-views', { chat: '-100', id: 3 }), 200);
  assert.equal(
    await status('story-views', { chat: '42', id: 3, offset: 5 }),
    400
  );
  assert.equal(await status('story-delete', { chat: '42', id: 3 }), 200);
  assert.equal(await status('story-delete', { chat: 'x', id: 3 }), 400);
  assert.equal(
    await status('stories-hide', { chat: '42', hidden: false }),
    200
  );
  assert.equal(await status('stories-hide', { chat: '42' }), 400);
  assert.equal(await status('stories', { hidden: 'x' }), 400);
  assert.equal(await status('stories', { hidden: true }), 200);
  assert.deepEqual(calls.find(([n]) => n === 'views')[1], {
    chat: '-100',
    id: 3,
    offset: '',
  });
  assert.deepEqual(calls.find(([n]) => n === 'stories')[1], { hidden: true });
});

test('the page helpers: reactions, hiding, rings, viewers', () => {
  assert.equal(LIKE, '❤');
  assert.ok(STORY_REACTIONS.includes('🔥'));
  assert.equal(reactionAfter('', '🔥'), '🔥');
  assert.equal(reactionAfter('🔥', '🔥'), '');
  assert.equal(reactionAfter('❤', '🔥'), '🔥');
  const peers = [
    { peer: '1', lastId: 5, maxReadId: 2 },
    { peer: '2', lastId: 5, maxReadId: 5 },
    { peer: '3', lastId: 5, maxReadId: 0 },
    { peer: '4', lastId: 5, maxReadId: 0, self: true },
  ];
  assert.equal(ringOf(peers, '1'), 'unread');
  assert.equal(ringOf(peers, '2'), 'seen');
  assert.equal(ringOf(peers, '4'), '');
  assert.equal(ringOf(peers, '9'), '');
  const moved = setHidden(peers, '1', true);
  assert.equal(ringOf(moved, '1'), '');
  assert.deepEqual(
    hiddenPeers(moved).map((p) => p.peer),
    ['1']
  );
  assert.equal(visiblePeers(moved).length, 3);
  assert.equal(visiblePeers(setHidden(moved, '1', false)).length, 4);
  assert.deepEqual(
    joinViews([{ user: '1' }], [{ user: '1' }, { user: '2' }]).map(
      (v) => v.user
    ),
    ['1', '2']
  );
});
