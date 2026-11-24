import {
  loadVkSendQueue,
  saveVkSendQueue,
} from '../automation/vk-queue-inspection.js';
import { createVkJobRoute } from './routes-vk-job.js';

export const handleVkSendQueue = createVkJobRoute({
  path: '/api/vk/send-queue',
  load: loadVkSendQueue,
  save: saveVkSendQueue,
  actions: {},
});
