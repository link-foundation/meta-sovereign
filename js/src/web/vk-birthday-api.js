import { vkBirthdaySettings } from '../automation/vk-birthday-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkBirthdayApi = (options) =>
  createVkReviewedJobApi(options, 'birthday', vkBirthdaySettings);
