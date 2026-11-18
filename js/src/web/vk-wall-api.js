import { createVkReviewedJobApi } from './vk-connection-api.js';
import { wallPolicy } from '../automation/vk-wall-settings.js';
export const createVkWallApi = (options) =>
  createVkReviewedJobApi(options, 'wall', wallPolicy);
