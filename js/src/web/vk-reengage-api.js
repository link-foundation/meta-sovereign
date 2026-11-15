import {
  reengageKinds,
  vkReengageSettings,
} from '../automation/vk-reengage-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkReengageApi = (options) =>
  Object.assign(
    {},
    ...reengageKinds.map((kind) =>
      createVkReviewedJobApi(options, kind, vkReengageSettings[kind])
    )
  );
