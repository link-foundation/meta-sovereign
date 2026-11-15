import { vkGreetSettings } from '../automation/vk-greet-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkGreetApi = (options) =>
  createVkReviewedJobApi(options, 'greet', vkGreetSettings);
