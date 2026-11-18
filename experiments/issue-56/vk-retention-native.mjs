import { verifyVkRetention } from '../../js/tests/helpers/e2e-vk-retention.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkRetention,
  'docs/screenshots/issue-56-vk-retention'
);
