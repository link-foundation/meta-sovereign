import {
  reengageKinds,
  vkReengageSettings,
} from '../automation/vk-reengage-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
const routes = reengageKinds.map((kind) => {
  const policy = vkReengageSettings[kind];
  return createVkJobRoute({
    path: `/api/vk/${kind}`,
    load: policy.load,
    save: policy.save,
    actions: {
      plan: (ctx) => ctx.vkReengage[kind].preview(),
      run: (ctx, body) =>
        ctx.vkReengage[kind].run({
          planId: body.planId,
          confirm: body.confirm,
        }),
    },
  });
});
export const handleVkReengage = async (...args) => {
  for (const route of routes) {
    if (await route(...args)) {
      return true;
    }
  }
  return false;
};
