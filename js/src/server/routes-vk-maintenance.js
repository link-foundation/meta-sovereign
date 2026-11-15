import {
  loadVkMaintenance,
  saveVkMaintenance,
} from '../automation/vk-maintenance.js';
import { maintenanceKinds } from '../automation/vk-maintenance-settings.js';
import { createVkJobFamilyRoutes } from './routes-vk-job.js';
export const handleVkMaintenance = createVkJobFamilyRoutes(
  maintenanceKinds,
  (kind) => ({
    load: (store) => loadVkMaintenance(store, kind),
    save: (store, body) => saveVkMaintenance(store, kind, body),
  }),
  (ctx, kind) => ctx.vkMaintenance[kind]
);
