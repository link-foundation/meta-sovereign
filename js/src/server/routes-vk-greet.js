import { vkGreetSettings } from '../automation/vk-greet-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
export const handleVkGreet = createVkJobRoute({
  path: '/api/vk/greet',
  load: vkGreetSettings.load,
  save: vkGreetSettings.save,
  actions: {
    plan: (ctx) => ctx.vkGreet.preview(),
    run: (ctx, body) =>
      ctx.vkGreet.run({ planId: body.planId, confirm: body.confirm }),
  },
});
