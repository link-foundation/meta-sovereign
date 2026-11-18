import { verifyVkDesktopPolicy } from '../../js/tests/helpers/e2e-vk-desktop-policy.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkDesktopPolicy,
  'docs/screenshots/issue-56-vk-desktop'
);
