import {
  loadVkMaintenance,
  saveVkMaintenance,
  maintenanceKinds,
} from '../automation/vk-maintenance-settings.js';
import { createVkConnectionApi } from './vk-connection-api.js';
export const createVkMaintenanceApi = (options) =>
  Object.fromEntries(
    maintenanceKinds.flatMap((kind) => {
      const api = createVkConnectionApi(
        options,
        `/api/vk/${kind}`,
        (store) => loadVkMaintenance(store, kind),
        (store, body) => saveVkMaintenance(store, kind, body)
      );
      const name = kind === 'cleanup' ? 'VkCleanup' : 'VkOutgoing';
      return [
        [`vk${name.slice(2)}`, api.load],
        [`save${name}`, api.save],
        [`plan${name}`, () => api.action('plan', {})],
        [
          `run${name}`,
          (planId) => api.action('run', { planId, confirm: true }),
        ],
      ];
    })
  );
