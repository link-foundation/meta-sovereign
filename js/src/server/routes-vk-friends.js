import { loadVkFriends, saveVkFriends } from '../automation/vk-friends.js';
import { createVkJobRoute } from './routes-vk-job.js';

export const handleVkFriends = createVkJobRoute({
  path: '/api/vk/friends',
  load: loadVkFriends,
  save: saveVkFriends,
  actions: {
    plan: (ctx) => ctx.vkFriends.preview(),
    run: (ctx, body) =>
      ctx.vkFriends.run({ planId: body.planId, confirm: body.confirm }),
  },
});
