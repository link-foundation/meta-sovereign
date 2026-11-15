import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkReadFailure } from '../../js/tests/helpers/e2e-vk-read-failure.mjs';
await reviewVkNative(
  verifyVkReadFailure,
  'docs/screenshots/issue-56-vk-read-failure'
);
