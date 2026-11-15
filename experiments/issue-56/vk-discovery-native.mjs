import { verifyVkDiscovery } from '../../js/tests/helpers/e2e-vk-discovery.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  verifyVkDiscovery,
  'docs/screenshots/issue-56-vk-discovery'
);
