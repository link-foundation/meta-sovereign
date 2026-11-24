import {
  discoveryKinds,
  discoveryPolicies,
} from '../automation/vk-discovery-settings.js';
import { createVkReviewedJobApi } from './vk-connection-api.js';
export const createVkDiscoveryApi = (options) =>
  Object.assign(
    {},
    ...discoveryKinds.map((kind) =>
      createVkReviewedJobApi(options, kind, discoveryPolicies[kind])
    )
  );
