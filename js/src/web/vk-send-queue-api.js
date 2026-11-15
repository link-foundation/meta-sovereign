import {
  loadVkSendQueue,
  saveVkSendQueue,
} from '../automation/vk-queue-inspection.js';
import { createVkConnectionApi } from './vk-connection-api.js';

export const createVkSendQueueApi = (options) => {
  const api = createVkConnectionApi(
    options,
    '/api/vk/send-queue',
    loadVkSendQueue,
    saveVkSendQueue
  );
  return { vkSendQueue: api.load, saveVkSendQueue: api.save };
};
