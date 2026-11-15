import { verifyVkCancelled } from '../../js/tests/helpers/e2e-vk-cancelled.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkCancelled,
  'docs/screenshots/issue-56-vk-cancelled'
);
