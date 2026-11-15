import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';
import { createVkDiscoveryJob } from '../../js/src/automation/vk-discovery.js';
import {
  discoveryKinds,
  discoveryPolicies,
} from '../../js/src/automation/vk-discovery-settings.js';
import { friendsServer, friendRelations } from './vk-friends-fixture.mjs';
export const discoveryProfile = (id, extra = {}) => ({
  id,
  online: 1,
  sex: 2,
  has_photo: 1,
  can_post: 1,
  can_see_all_posts: 1,
  can_write_private_message: 1,
  can_send_friend_request: 1,
  is_closed: false,
  can_access_closed: true,
  ...extra,
});
export const discoveryAdapter = (options = {}) => {
  let owner = 1;
  let count = 2;
  let mode = 'confirmed';
  const profiles = new Map(
    [7, 8, 11, 13, 15, 21, 22, 23, 24, 31, 32].map((id) => [
      id,
      discoveryProfile(id),
    ])
  );
  profiles.get(15).sex = 1;
  profiles.get(21).deactivated = 'banned';
  profiles.get(22).deactivated = 'deleted';
  profiles.get(24).deactivated = 'deleted';
  const relations = new Map([
    [8, 3],
    [24, 3],
    [21, 2],
    [22, 2],
    [23, 2],
    [31, 1],
    [32, 1],
  ]);
  const suggestions = [7, 13, 11];
  const community = [7, 11, 15];
  const members = new Set(community);
  const mutuals = new Map([
    [7, 3],
    [13, 9],
    [11, 9],
  ]);
  const effects = [];
  const page = (ids, p, objects = false) => ({
    count: ids.length,
    items: ids
      .slice(Number(p.offset ?? 0), Number(p.offset ?? 0) + Number(p.count))
      .map((id) => (objects ? profiles.get(id) : id)),
  });
  const write = (kind, p) => {
    const id = Number(p.user_id);
    const effect = { kind, id };
    effects.push(effect);
    const answer = options.response?.(effect, effects.length) ?? mode;
    if (typeof answer === 'number' || answer === 'refused') {
      return {
        error: {
          error_code: typeof answer === 'number' ? answer : 15,
          error_msg: 'Synthetic discovery refusal',
        },
      };
    }
    if (answer === 'unconfirmed') {
      return kind === 'add' ? 0 : { success: 1, friend_deleted: 1 };
    }
    const old = relations.get(id) ?? 0;
    relations.set(id, kind === 'add' ? 1 : 0);
    if (answer === 'unknown') {
      throw new Error('Synthetic discovery reply lost');
    }
    if (kind === 'add') {
      return 1;
    }
    return {
      success: 1,
      [old === 2
        ? 'in_request_deleted'
        : old === 3
          ? 'friend_deleted'
          : 'out_request_deleted']: 1,
    };
  };
  const fake = createFakeVk({
    methods: {
      'users.get': (p) =>
        p.user_ids
          ? p.user_ids
              .split(',')
              .map(Number)
              .map((id) => profiles.get(id))
          : [{ id: owner }],
      'friends.get': (p) => ({
        count,
        items: [8, 24]
          .filter((id) => relations.get(id) === 3)
          .slice(Number(p.offset ?? 0), Number(p.offset ?? 0) + Number(p.count))
          .map((id) => (p.fields ? profiles.get(id) : id)),
      }),
      'friends.areFriends': friendRelations(relations),
      'friends.getSuggestions': (p) =>
        page(
          suggestions.filter((id) => (relations.get(id) ?? 0) === 0),
          p,
          true
        ),
      'friends.getMutual': (p) =>
        p.target_uids
          .split(',')
          .map(Number)
          .map((id) => ({ id, common_count: mutuals.get(id) ?? 0 })),
      'groups.getMembers': (p) =>
        page(
          community.filter((id) => members.has(id)),
          p
        ),
      'groups.isMember': (p) => (members.has(Number(p.user_id)) ? 1 : 0),
      'friends.getRequests': (p) =>
        page(
          [...relations]
            .filter(([, relation]) => relation === (p.out === '1' ? 1 : 2))
            .map(([id]) => id),
          p
        ),
      'friends.add': (p) => write('add', p),
      'friends.delete': (p) => write('delete', p),
      ...options.methods,
    },
  });
  return {
    fake,
    live: createVkLive({
      ...fake,
      limiter: { wait: async () => {} },
      ...options.live,
    }),
    profiles,
    relations,
    suggestions,
    community,
    members,
    mutuals,
    effects,
    mode: (value) => {
      mode = value;
    },
    account: (value) => {
      owner = value;
    },
    count: (value) => {
      count = value;
    },
  };
};
export const discoveryOptions = (adapter, extra = {}) => ({
  resolve: () => ({ live: adapter.live }),
  optionsFor: async () => ({ token: 'fixture-user-token' }),
  now: () => Date.UTC(2026, 10, 15, 12),
  sleep: async () => {},
  ...extra,
});
export const discoveryJob = (
  store,
  adapter,
  kind = 'suggestions',
  extra = {}
) => createVkDiscoveryJob({ store, kind, ...discoveryOptions(adapter, extra) });
export const seedDiscovery = async (store, kind, settings = {}) => {
  const policy = discoveryPolicies[kind];
  await policy.save(store, {
    ...(await policy.settings(store)),
    ...(kind === 'community' ? { communityId: 55 } : {}),
    ...settings,
  });
};
export const withDiscovery = async (
  check,
  {
    store = createMemoryStore(),
    adapter = discoveryAdapter(),
    kind = 'suggestions',
    settings = {},
    options = {},
  } = {}
) => {
  await seedDiscovery(store, kind, settings);
  const job = discoveryJob(store, adapter, kind, options);
  try {
    return await check({ store, adapter, job, kind });
  } finally {
    await job.stop();
  }
};
export const runDiscovery = async (job) => {
  const { plan } = await job.preview();
  return job.run({ planId: plan.planId, confirm: true });
};
export const discoveryServer = async (options = {}) => {
  const adapter = options.adapter ?? discoveryAdapter();
  const vkDiscovery = Object.fromEntries(
    discoveryKinds.map((kind) => [
      kind,
      discoveryOptions(adapter, options.vkDiscovery?.[kind]),
    ])
  );
  const vkMaintenance = Object.fromEntries(
    ['cleanup', 'outgoing'].map((kind) => [kind, discoveryOptions(adapter)])
  );
  const fixture = await friendsServer({
    ...options,
    adapter,
    vkDiscovery,
    vkMaintenance,
  });
  for (const kind of discoveryKinds) {
    await seedDiscovery(fixture.store, kind, options.settings?.[kind]);
  }
  return fixture;
};
