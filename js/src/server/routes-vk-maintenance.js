import {
  loadVkMaintenance,
  saveVkMaintenance,
} from '../automation/vk-maintenance.js';
import { maintenanceKinds } from '../automation/vk-maintenance-settings.js';
import { createVkJobRoute } from './routes-vk-job.js';
const routes = maintenanceKinds.map((kind) =>
  createVkJobRoute({
    path: `/api/vk/${kind}`,
    load: (store) => loadVkMaintenance(store, kind),
    save: (store, body) => saveVkMaintenance(store, kind, body),
    actions: {
      plan: (ctx) => ctx.vkMaintenance[kind].preview(),
      run: (ctx, body) =>
        ctx.vkMaintenance[kind].run({
          planId: body.planId,
          confirm: body.confirm,
        }),
    },
  })
);
export const handleVkMaintenance = async (...args) => {
  for (const route of routes) {
    if (await route(...args)) {
      return true;
    }
  }
  return false;
};
