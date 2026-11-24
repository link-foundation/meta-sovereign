import { wallPolicy } from '../automation/vk-wall-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
export const handleVkWall = createVkJobRoute({
  path: '/api/vk/wall',
  load: wallPolicy.load,
  save: wallPolicy.save,
  actions: {
    plan: (ctx) => ctx.vkWall.preview(),
    run: (ctx, body) =>
      ctx.vkWall.run({ planId: body.planId, confirm: body.confirm }),
  },
});
