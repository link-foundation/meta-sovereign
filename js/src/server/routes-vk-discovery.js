import {
  discoveryKinds,
  discoveryPolicies,
} from '../automation/vk-discovery-settings.js';
import { createVkJobFamilyRoutes } from './routes-vk-job.js';
export const handleVkDiscovery = createVkJobFamilyRoutes(
  discoveryKinds,
  (kind) => discoveryPolicies[kind],
  (ctx, kind) => ctx.vkDiscovery[kind]
);
