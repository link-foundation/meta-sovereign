import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';
import { createVkFriendsJob } from '../../js/src/automation/vk-friends.js';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

export const serveFriendsFixture = (fixture) =>
  serveQuestionLinkFixture({
    ...fixture,
    stats: () => ({
      syntheticFriendCalls: fixture.effects.length,
      messages: fixture.messages(),
      liveProvider: false,
    }),
  });

export const friendsJob = (store, adapter, extra = {}) =>
  createVkFriendsJob({
    store,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    sleep: async () => {},
    ...extra,
  });

export const friendRelations = (relations) => (params) =>
  params.user_ids
    .split(',')
    .map(Number)
    .map((user_id) => ({
      user_id,
      friend_status: relations.get(user_id) ?? 0,
    }));

/** Finite actual-adapter fixture, with no authenticated provider sessions. */
export const friendsAdapter = (extra = {}) => {
  let mode = 'confirmed';
  let accountId = 1;
  let count = extra.count ?? 1;
  const relations =
    extra.relations ??
    new Map([
      [7, 0],
      [8, 3],
      [9, 2],
      [11, 2],
    ]);
  const effects = [];
  const fake = createFakeVk({
    methods: {
      'users.get': () => [{ id: accountId }],
      'friends.get': () => ({ count, items: [8] }),
      'friends.getRequests': (params) => ({
        count: 2,
        items: [9, 11]
          .filter((id) => relations.get(id) === 2)
          .slice(0, Number(params.count)),
      }),
      'friends.areFriends': friendRelations(relations),
      'friends.add': (params) => {
        const userId = Number(params.user_id);
        effects.push(userId);
        if (mode === 'refused') {
          return {
            error: { error_code: 29, error_msg: 'Fixture rate refusal' },
          };
        }
        if (mode === 'unknown') {
          throw new Error('Fixture friend response lost');
        }
        if (mode === 'unconfirmed') {
          return 0;
        }
        const accepted = relations.get(userId) === 2;
        relations.set(userId, accepted ? 3 : 1);
        if (accepted) {
          count++;
        }
        return accepted ? 2 : 1;
      },
      ...extra.methods,
    },
  });
  const live = createVkLive({
    ...fake,
    limiter: { wait: async () => {} },
    ...extra.live,
  });
  return {
    fake,
    live,
    effects,
    relations,
    mode: (value) => {
      mode = value;
    },
    account: (value) => {
      accountId = value;
    },
    count: (value) => {
      count = value;
    },
  };
};
export const friendsServer = async ({
  scheduler = false,
  clock = {},
  online = {},
  port = 0,
  adapter = friendsAdapter(),
  vkMaintenance,
  vkCancelled,
  vkGreet,
  vkReengage,
  vkWall,
  vkBirthday,
  vkRetention,
  vkDiscovery,
} = {}) => {
  const store = createMemoryStore();
  let writesRefused = false;
  let messages = 0;
  store.flush = async () => {
    if (writesRefused) {
      throw new Error('Fixture friend acknowledgement refused');
    }
  };
  const server = await startServer({
    store,
    port,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler,
      vkOnline: online,
      vkMaintenance,
      vkCancelled,
      vkGreet,
      vkReengage,
      vkWall,
      vkBirthday,
      vkRetention,
      vkDiscovery,
      vkFriends: {
        sleep: async () => {},
        ...clock,
        resolve: () => ({ live: adapter.live }),
        optionsFor: async () => ({ token: 'fixture-user-token' }),
      },
      send: async () => {
        messages++;
        throw new Error('Unexpected message');
      },
    },
    log: null,
  });
  return {
    ...adapter,
    store,
    base: `http://127.0.0.1:${server.port}`,
    port: server.port,
    messages: () => messages,
    refuseWrites: (value) => {
      writesRefused = value;
    },
    close: () => server.close(),
  };
};
