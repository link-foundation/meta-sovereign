import {
  loadVkCancelled,
  saveVkCancelled,
} from '../automation/vk-cancelled-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkCancelledApi = (options) =>
  createVkReviewedJobApi(options, 'cancelled', {
    load: loadVkCancelled,
    save: saveVkCancelled,
  });
