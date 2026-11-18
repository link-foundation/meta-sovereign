import {
  loadVkCancelled,
  saveVkCancelled,
} from '../automation/vk-cancelled-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
export const handleVkCancelled = createVkJobRoute({
  path: '/api/vk/cancelled',
  load: loadVkCancelled,
  save: saveVkCancelled,
  actions: {
    plan: (ctx) => ctx.vkCancelled.preview(),
    run: (ctx, body) =>
      ctx.vkCancelled.run({ planId: body.planId, confirm: body.confirm }),
  },
});
