import { verifyVkMaintenance } from '../../js/tests/helpers/e2e-vk-maintenance.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkMaintenance,
  'docs/screenshots/issue-56-vk-maintenance'
);
