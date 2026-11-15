import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import {
  createVkMaintenanceJob,
  loadVkMaintenance,
  saveVkMaintenance,
} from '../automation/vk-maintenance.js';
import { maintenanceKinds } from '../automation/vk-maintenance-settings.js';
export const createVkMaintenanceCommands = (options) =>
  Object.assign(
    {},
    ...maintenanceKinds.map((kind) =>
      createVkFriendPolicyCommands({
        ...options,
        name: `vk-${kind}`,
        load: (store) => loadVkMaintenance(store, kind),
        save: (store, settings) => saveVkMaintenance(store, kind, settings),
        createJob: (context) =>
          (options.createJob ?? createVkMaintenanceJob)({ ...context, kind }),
        flags: { 'every-minutes': 'everyMinutes', limit: 'limit' },
      })
    )
  );
