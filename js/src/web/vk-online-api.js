import {
  loadVkOnline,
  saveVkOnline,
} from '../automation/vk-online-settings.js';
import { createVkConnectionApi } from './vk-connection-api.js';

export const createVkOnlineApi = (options) => {
  const api = createVkConnectionApi(
    options,
    '/api/vk/online',
    loadVkOnline,
    saveVkOnline
  );
  return {
    vkOnline: api.load,
    saveVkOnline: api.save,
    runVkOnline: () => api.action('run', {}),
  };
};
