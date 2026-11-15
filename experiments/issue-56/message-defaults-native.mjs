import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkMessageDefaults } from '../../js/tests/helpers/e2e-vk-message-defaults.mjs';
await reviewVkNative(
  verifyVkMessageDefaults,
  'docs/screenshots/issue-56-message-defaults'
);
