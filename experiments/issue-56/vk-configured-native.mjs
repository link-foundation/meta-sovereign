import { verifyVkConfigured } from '../../js/tests/helpers/e2e-vk-configured.mjs';
import { reviewVkNative } from './vk-native-review.mjs';

await reviewVkNative(
  verifyVkConfigured,
  'docs/screenshots/issue-56-vk-configured'
);
