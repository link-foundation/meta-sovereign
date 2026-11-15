import { friendsAdapter, friendsServer } from './vk-friends-fixture.mjs';
import {
  personalFixtureOptions,
  cancelledNow,
} from './vk-cancelled-fixture.mjs';
import { createVkWallJob } from '../../js/src/automation/vk-wall.js';
import { wallPolicy } from '../../js/src/automation/vk-wall-settings.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

/** Finite native-method fixture. It never opens an authenticated VK session. */
export const wallAdapter = (options = {}) => {
  let account = 1;
  let nextId = 1000;
  let mode = 'confirmed';
  const effects = [];
  const profile = { photo_id: '1_75' };
  const walls = new Map();
  const addPost = (community, text, extra = {}) => {
    const post = {
      id: ++nextId,
      owner_id: -community,
      from_id: account,
      date: Math.floor(cancelledNow / 1000) - 86400,
      text,
      can_delete: 1,
      attachments: [],
      ...extra,
    };
    walls.get(community).unshift(post);
    return post;
  };
  for (const community of options.communities ?? [42]) {
    walls.set(community, []);
    addPost(community, 'Add me as a friend: old owned invitation');
    addPost(community, 'Add me as a friend: foreign invitation', {
      from_id: 2,
    });
    addPost(community, 'Add me as a friend: undeletable', { can_delete: 0 });
    for (let index = 0; index < 10; index++) {
      addPost(community, `Unrelated post ${index}`, { from_id: 2 });
    }
  }
  const list = (params, search = false) => {
    const posts = walls.get(-Number(params.owner_id)) ?? [];
    const selected = search
      ? posts.filter((p) => p.text.includes(params.query))
      : posts;
    const offset = Number(params.offset ?? 0);
    return {
      count: selected.length,
      items: selected.slice(offset, offset + Number(params.count)),
    };
  };
  const effect = async (params, action) => {
    const community = -Number(params.owner_id);
    const step = {
      action,
      community,
      text: params.message ?? '',
      attachments: params.attachments ?? '',
      postId: Number(params.post_id ?? 0),
      guid: params.guid ?? null,
    };
    effects.push(step);
    const response = (await options.response?.(step, effects.length)) ?? mode;
    if (response === 'unknown') {
      throw new Error('Fixture wall response lost');
    }
    if (response === 'refused') {
      return {
        error: {
          error_code: options.refusedCode ?? (action === 'delete' ? 100 : 15),
          error_msg: 'Fixture wall permission refused',
        },
      };
    }
    if (response === 'unconfirmed') {
      return 0;
    }
    if (action === 'delete') {
      walls.set(
        community,
        walls.get(community).filter((post) => post.id !== step.postId)
      );
      return 1;
    }
    const attachments = step.attachments
      ? step.attachments.split(',').map((id) => {
          const [, type, owner, identity] =
            /^(photo|audio|video|doc)(-?\d+)_(\d+)/u.exec(id);
          return {
            type,
            [type]: { owner_id: Number(owner), id: Number(identity) },
          };
        })
      : [];
    return { post_id: addPost(community, step.text, { attachments }).id };
  };
  const adapter = friendsAdapter({
    methods: {
      'users.get': () => [{ id: account, ...profile }],
      'wall.get': (params) => list(params),
      'wall.search': (params) => list(params, true),
      'wall.getById': (params) => {
        const [community, id] = params.posts.split('_').map(Number);
        return (walls.get(-community) ?? []).filter((post) => post.id === id);
      },
      'photos.getById': () => [
        { owner_id: 1, id: 75, access_key: 'fixtureKey' },
      ],
      'wall.post': (params) => effect(params, 'post'),
      'wall.delete': (params) => effect(params, 'delete'),
      ...options.methods,
    },
    live: options.limiter ? { limiter: options.limiter } : {},
  });
  return {
    ...adapter,
    walls,
    profile,
    addPost,
    effects,
    account: (value) => {
      account = value;
    },
    mode: (value) => {
      mode = value;
    },
  };
};
export const wallJob = (store, adapter, options = {}) =>
  createVkWallJob({
    store,
    ...personalFixtureOptions(adapter, options),
  });
export const withWallJob = async (
  check,
  {
    adapter = wallAdapter(),
    store = createMemoryStore(),
    settings = {},
    ...options
  } = {}
) => {
  await wallPolicy.save(store, {
    ...(await wallPolicy.settings(store)),
    communities: '42',
    attachments: 'audio-1_23',
    ...settings,
  });
  const job = wallJob(store, adapter, options);
  try {
    return await check({ job, store, adapter, policy: wallPolicy });
  } finally {
    await job.stop();
  }
};
export const runWall = async (job) => {
  const { plan } = await job.preview();
  return job.run({ planId: plan.planId, confirm: true });
};
export const wallServer = (options = {}) => {
  const adapter = options.adapter ?? wallAdapter();
  return friendsServer({
    ...options,
    adapter,
    vkWall: personalFixtureOptions(adapter, options.vkWall),
  });
};

export const serveWallInspection = async (options = {}) => {
  const fixture = await wallServer(options);
  serveQuestionLinkFixture({
    ...fixture,
    stats: () => ({
      syntheticWallCalls: fixture.effects.length,
      unexpectedMessages: fixture.messages(),
      liveProvider: false,
    }),
  });
};
