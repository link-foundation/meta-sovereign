import { vkBirthdaySettings } from '../automation/vk-birthday-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
export const handleVkBirthday = createVkJobRoute({
  path: '/api/vk/birthday',
  load: vkBirthdaySettings.load,
  save: vkBirthdaySettings.save,
  actions: {
    plan: (ctx) => ctx.vkBirthday.preview(),
    run: (ctx, body) =>
      ctx.vkBirthday.run({ planId: body.planId, confirm: body.confirm }),
  },
});
