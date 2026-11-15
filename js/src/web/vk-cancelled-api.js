import {
  loadVkCancelled,
  saveVkCancelled,
} from '../automation/vk-cancelled-settings.js';
import { createVkConnectionApi } from './vk-connection-api.js';
export const createVkCancelledApi = (options) => {
  const api = createVkConnectionApi(
    options,
    '/api/vk/cancelled',
    loadVkCancelled,
    saveVkCancelled
  );
  return {
    vkCancelled: api.load,
    saveVkCancelled: api.save,
    planVkCancelled: () => api.action('plan', {}),
    runVkCancelled: (planId) => api.action('run', { planId, confirm: true }),
  };
};
