import { retentionPolicy } from '../automation/vk-retention-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkRetentionApi = (options) =>
  createVkReviewedJobApi(options, 'retention', retentionPolicy);
