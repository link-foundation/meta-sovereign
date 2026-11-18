import { verifyVkWallParity } from '../../js/tests/helpers/e2e-vk-wall-parity.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkWallParity,
  'docs/screenshots/issue-56-vk-wall-parity'
);
