import { loadVkFriends, saveVkFriends } from '../automation/vk-friends.js';
import { createVkJobRoute } from './routes-vk-job.js';
import { readVkFriendStats } from '../automation/vk-friend-stats.js';
import { json } from './util.js';

const policyRoute = createVkJobRoute({
  path: '/api/vk/friends',
  load: loadVkFriends,
  save: saveVkFriends,
  actions: {
    'seed-priority': (ctx) => ctx.vkFriends.seedPriority(),
    'clear-priority': (ctx) => ctx.vkFriends.clearPriority(),
    plan: (ctx) => ctx.vkFriends.preview(),
    run: (ctx, body) =>
      ctx.vkFriends.run({ planId: body.planId, confirm: body.confirm }),
  },
});

export const handleVkFriends = async (store, req, res, path, ...rest) => {
  if (path !== '/api/vk/friends/stats') {
    return policyRoute(store, req, res, path, ...rest);
  }
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, error: 'method not supported' });
    return true;
  }
  try {
    json(res, 200, await readVkFriendStats(store));
  } catch {
    json(res, 503, { ok: false, error: 'friend statistics unavailable' });
  }
  return true;
};
