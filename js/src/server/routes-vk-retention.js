import { retentionPolicy } from '../automation/vk-retention-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
export const handleVkRetention = createVkJobRoute({
  path: '/api/vk/retention',
  load: retentionPolicy.load,
  save: retentionPolicy.save,
  actions: {
    plan: (ctx) => ctx.vkRetention.preview(),
    run: (ctx, body) =>
      ctx.vkRetention.run({ planId: body.planId, confirm: body.confirm }),
  },
});
