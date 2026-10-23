// The rest of the story features (R-Y199): stealth mode (and the state the
// strip's answer carries), the viewers with search, switches, reactions,
// forwards and reposts, reporting a story, fresh view counts; Telegram's
// errors as codes; the routes' validation; the pure page helpers. Fake
// clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStoryActions } from '../src/sources/telegram-story-actions.js';
import { createStoryExtras } from '../src/sources/telegram-story-extras.js';
import { createStories } from '../src/sources/telegram-stories.js';
import {
  NO_STEALTH,
  STEALTH_ACTIVE_S,
  clockText,
  joinViews,
  stealthAfter,
  stealthStatus,
  viewersBody,
  withFreshCounts,
} from '../src/web/stories-model.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  ReactionEmoji: named('ReactionEmoji'),
  stories: {
    ActivateStealthMode: named('ActivateStealthMode'),
    GetStoryReactionsList: named('GetStoryReactionsList'),
    GetStoryViewsList: named('GetStoryViewsList'),
    GetStoriesViews: named('GetStoriesViews'),
    Report: named('Report'),
    GetAllStories: named('GetAllStories'),
  },
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ peer: chat }) },
  };
  const context = { userClient: async () => client };
  return {
    actions: {
      ...createStoryActions(env, context),
      ...createStoryExtras(env, context),
    },
    stories: createStories(env, context),
    log,
  };
};

test('stealth mode asks for both flags and reads the update it gets', async () => {
  const { actions, log } = make(() => ({
    className: 'Updates',
    updates: [
      {
        className: 'UpdateStoriesStealthMode',
        stealthMode: { activeUntilDate: 1500, cooldownUntilDate: 4000 },
      },
    ],
  }));
  const got = await actions.storyStealth({ past: true, future: true });
  assert.deepEqual(got, {
    ok: true,
    stealth: { activeUntil: 1500, cooldownUntil: 4000 },
  });
  assert.equal(log[0].className, 'ActivateStealthMode');
  assert.equal(log[0].past, true);
  assert.equal(log[0].future, true);
  await actions.storyStealth({ past: false, future: true });
  assert.equal(log[1].past, undefined);
  assert.equal(log[1].future, true);
});

test('an answer with no stealth update gives null; bad flags never ask', async () => {
  const { actions, log } = make(() => ({ className: 'UpdatesTooLong' }));
  assert.deepEqual(await actions.storyStealth({ past: true, future: false }), {
    ok: true,
    stealth: null,
  });
  for (const request of [
    {},
    { past: false, future: false },
    { past: 'yes', future: true },
  ]) {
    assert.equal((await actions.storyStealth(request)).ok, false);
  }
  assert.equal(log.length, 1);
});

test('a free account gets a clear code for stealth mode', async () => {
  const free = make(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal(
    (await free.actions.storyStealth({ past: true, future: true })).code,
    'premium'
  );
  const cool = make(() => telegramError('STORIES_STEALTH_COOLDOWN_123'));
  assert.equal(
    (await cool.actions.storyStealth({ past: true, future: true })).code,
    'cooldown'
  );
});

test('the strip carries the stealth state', async () => {
  const { stories } = make(() => ({
    className: 'stories.AllStories',
    hasMore: false,
    state: 'S',
    users: [],
    chats: [],
    peerStories: [],
    stealthMode: { activeUntilDate: 90, cooldownUntilDate: 200 },
  }));
  const got = await stories.stories({});
  assert.deepEqual(got.stealth, { activeUntil: 90, cooldownUntil: 200 });
  const none = make(() => ({
    className: 'stories.AllStories',
    peerStories: [],
    stealthMode: {},
  }));
  assert.deepEqual((await none.stories.stories({})).stealth, {
    activeUntil: 0,
    cooldownUntil: 0,
  });
});

test('the viewers list takes a search and the two switches', async () => {
  const { actions, log } = make(() => ({
    count: 1,
    users: [{ id: 5n, firstName: 'Ann' }],
    chats: [{ id: 9n, title: 'News' }],
    views: [
      { className: 'StoryView', userId: 5n, date: 10 },
      {
        className: 'StoryViewPublicForward',
        message: { peerId: { channelId: 9n }, date: 20 },
      },
      {
        className: 'StoryViewPublicRepost',
        peerId: { channelId: 9n },
        story: { date: 30 },
      },
    ],
  }));
  const got = await actions.storyViews({
    chat: '7',
    id: 3,
    q: 'an',
    justContacts: true,
    reactionsFirst: true,
  });
  assert.equal(log[0].q, 'an');
  assert.equal(log[0].justContacts, true);
  assert.equal(log[0].reactionsFirst, true);
  assert.equal(log[0].forwardsFirst, undefined);
  assert.deepEqual(
    got.views.map((v) => [v.kind, v.user, v.name, v.date]),
    [
      ['view', '5', 'Ann', 10],
      ['forward', '-1009', 'News', 20],
      ['repost', '-1009', 'News', 30],
    ]
  );
  await actions.storyViews({ chat: '7', id: 3 });
  assert.equal(log[1].q, undefined);
  assert.equal(log[1].justContacts, undefined);
  for (const bad of [{ q: 5 }, { justContacts: 'y' }, { q: 'x'.repeat(129) }]) {
    assert.equal(
      (await actions.storyViews({ chat: '7', id: 3, ...bad })).ok,
      false
    );
  }
  assert.equal(log.length, 2);
});

test('the reactions list has reactions, forwards and reposts as entries', async () => {
  const { actions, log } = make(() => ({
    count: 3,
    nextOffset: 'R2',
    users: [{ id: 5n, firstName: 'Ann' }],
    chats: [{ id: 9n, title: 'News' }],
    reactions: [
      {
        className: 'StoryReaction',
        peerId: { userId: 5n },
        date: 11,
        reaction: { className: 'ReactionEmoji', emoticon: '🔥' },
      },
      {
        className: 'StoryReactionPublicForward',
        message: { peerId: { channelId: 9n }, date: 21 },
      },
      {
        className: 'StoryReactionPublicRepost',
        peerId: { channelId: 9n },
        story: { date: 31 },
      },
    ],
  }));
  const got = await actions.storyReactions({
    chat: '7',
    id: 3,
    forwardsFirst: true,
    offset: 'R1',
    reaction: '🔥',
  });
  assert.equal(log[0].className, 'GetStoryReactionsList');
  assert.equal(log[0].forwardsFirst, true);
  assert.equal(log[0].offset, 'R1');
  assert.equal(log[0].limit, 50);
  assert.equal(log[0].reaction.emoticon, '🔥');
  assert.equal(got.next, 'R2');
  assert.deepEqual(
    got.views.map((v) => [v.kind, v.user, v.name, v.reaction]),
    [
      ['view', '5', 'Ann', '🔥'],
      ['forward', '-1009', 'News', ''],
      ['repost', '-1009', 'News', ''],
    ]
  );
  await actions.storyReactions({ chat: '7', id: 3 });
  assert.equal(log[1].reaction, undefined);
  assert.equal(log[1].offset, '');
  assert.equal(
    (await actions.storyReactions({ chat: '7', id: 3, offset: '<' })).ok,
    false
  );
});

test('reporting a story walks the same reasons as a chat report', async () => {
  const { actions, log } = make((request) =>
    request.option.length === 0
      ? {
          className: 'ReportResultChooseOption',
          title: 'Why?',
          options: [{ text: 'Spam', option: Buffer.from('s1') }],
        }
      : request.message
        ? { className: 'ReportResultReported' }
        : {
            className: 'ReportResultAddComment',
            optional: true,
            option: Buffer.from('s1'),
          }
  );
  const first = await actions.storyReport({ chat: '42', id: 8 });
  assert.equal(first.result, 'choose');
  assert.deepEqual(first.options, [
    { text: 'Spam', option: Buffer.from('s1').toString('base64') },
  ]);
  assert.equal(log[0].className, 'Report');
  assert.deepEqual(log[0].id, [8]);
  const option = first.options[0].option;
  const next = await actions.storyReport({ chat: '42', id: 8, option });
  assert.deepEqual(next, {
    ok: true,
    result: 'comment',
    optional: true,
    option,
  });
  assert.equal(Buffer.from(log[1].option).toString(), 's1');
  const done = await actions.storyReport({
    chat: '42',
    id: 8,
    option,
    message: 'rude',
  });
  assert.equal(done.result, 'reported');
  assert.equal(log[2].message, 'rude');
  for (const bad of [
    { id: 0 },
    { option: '***' },
    { message: 'x'.repeat(513) },
  ]) {
    assert.equal(
      (await actions.storyReport({ chat: '42', id: 8, ...bad })).ok,
      false
    );
  }
  assert.equal(log.length, 3);
});

test('fresh counters come back in the order of the ids', async () => {
  const { actions, log } = make(() => ({
    views: [
      { viewsCount: 9, reactionsCount: 2, forwardsCount: 1 },
      { viewsCount: 4 },
    ],
  }));
  assert.deepEqual(await actions.storiesViews({ chat: '7', ids: [3, 5] }), {
    ok: true,
    stories: [
      { id: 3, views: 9, reactions: 2, forwards: 1 },
      { id: 5, views: 4, reactions: 0, forwards: 0 },
    ],
  });
  assert.deepEqual(log[0].id, [3, 5]);
  for (const ids of [[], [0], 'x', Array(101).fill(1)]) {
    assert.equal((await actions.storiesViews({ chat: '7', ids })).ok, false);
  }
  assert.equal(log.length, 1);
});

test('the routes validate their bodies', async () => {
  const calls = [];
  const spy = (name) => async (r) => calls.push([name, r]) && { ok: true };
  const account = {
    storyStealth: spy('stealth'),
    storyReactions: spy('reactions'),
    storyReport: spy('report'),
    storiesViews: spy('views'),
    storyViews: spy('list'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('story-stealth', { past: true, future: true }),
    200
  );
  assert.equal(
    await status('story-stealth', { past: false, future: false }),
    400
  );
  assert.equal(await status('story-stealth', { past: true }), 400);
  assert.equal(await status('story-reactions', { chat: '7', id: 3 }), 200);
  assert.equal(
    await status('story-reactions', { chat: '7', id: 3, forwardsFirst: 1 }),
    400
  );
  assert.equal(
    await status('story-reactions', { chat: '7', id: 3, offset: '<' }),
    400
  );
  assert.equal(
    await status('story-report', { chat: '7', id: 3, option: 'AAEC' }),
    200
  );
  assert.equal(
    await status('story-report', { chat: '7', id: 3, option: '!!' }),
    400
  );
  assert.equal(await status('story-report', { chat: '7', id: '3' }), 400);
  assert.equal(await status('stories-views', { chat: '7', ids: [3] }), 200);
  assert.equal(await status('stories-views', { chat: '7', ids: [] }), 400);
  assert.equal(await status('stories-views', { chat: '7', ids: [1.5] }), 400);
  assert.equal(
    await status('story-views', {
      chat: '7',
      id: 3,
      q: 'ann',
      justContacts: true,
    }),
    200
  );
  assert.equal(await status('story-views', { chat: '7', id: 3, q: 4 }), 400);
  assert.equal(
    await status('story-views', { chat: '7', id: 3, reactionsFirst: 'y' }),
    400
  );
  assert.deepEqual(calls.find(([n]) => n === 'list')[1], {
    chat: '7',
    id: 3,
    offset: '',
    q: 'ann',
    justContacts: true,
  });
  assert.deepEqual(calls.find(([n]) => n === 'stealth')[1], {
    past: true,
    future: true,
  });
});

test('page helpers: stealth state, clock, viewers body, fresh counts', () => {
  const NOW = 10_000;
  assert.deepEqual(stealthStatus(NO_STEALTH, NOW), {
    phase: 'idle',
    left: 0,
    wait: 0,
  });
  assert.deepEqual(
    stealthStatus({ activeUntil: NOW + 90, cooldownUntil: NOW + 900 }, NOW),
    { phase: 'active', left: 90, wait: 900 }
  );
  assert.equal(
    stealthStatus({ activeUntil: NOW - 1, cooldownUntil: NOW + 5 }, NOW).phase,
    'cooldown'
  );
  assert.equal(
    stealthStatus({ activeUntil: NOW - 1, cooldownUntil: NOW - 1 }, NOW).phase,
    'idle'
  );
  const answered = { activeUntil: 1, cooldownUntil: 2 };
  assert.equal(stealthAfter({ stealth: answered }, NOW), answered);
  assert.equal(
    stealthAfter({ stealth: null }, NOW).activeUntil,
    NOW + STEALTH_ACTIVE_S
  );
  assert.equal(clockText(65), '1:05');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(3725), '1:02:05');
  assert.deepEqual(
    viewersBody(
      { chat: '7', id: 3, tab: 'viewers', q: '', contacts: false },
      ''
    ),
    { chat: '7', id: 3 }
  );
  assert.deepEqual(
    viewersBody(
      {
        chat: '7',
        id: 3,
        tab: 'viewers',
        q: 'a',
        contacts: true,
        reactionsFirst: true,
      },
      'N'
    ),
    {
      chat: '7',
      id: 3,
      offset: 'N',
      q: 'a',
      justContacts: true,
      reactionsFirst: true,
    }
  );
  assert.deepEqual(
    viewersBody(
      { chat: '7', id: 3, tab: 'reactions', q: 'a', contacts: true },
      ''
    ),
    { chat: '7', id: 3 }
  );
  const story = { id: 3, views: 1, reactions: 0 };
  assert.deepEqual(
    withFreshCounts(story, { id: 3, views: 9, reactions: 2, forwards: 1 }),
    { id: 3, views: 9, reactions: 2, forwards: 1 }
  );
  assert.equal(withFreshCounts(story, undefined), story);
  assert.deepEqual(
    joinViews(
      [{ kind: 'view', user: '5' }],
      [
        { kind: 'view', user: '5' },
        { kind: 'repost', user: '5' },
      ]
    ),
    [
      { kind: 'view', user: '5' },
      { kind: 'repost', user: '5' },
    ]
  );
});
