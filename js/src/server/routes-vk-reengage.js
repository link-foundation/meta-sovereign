import {
  reengageKinds,
  vkReengageSettings,
} from '../automation/vk-reengage-settings.js';
import { createVkJobFamilyRoutes } from './routes-vk-job.js';
export const handleVkReengage = createVkJobFamilyRoutes(
  reengageKinds,
  (kind) => vkReengageSettings[kind],
  (ctx, kind) => ctx.vkReengage[kind]
);
