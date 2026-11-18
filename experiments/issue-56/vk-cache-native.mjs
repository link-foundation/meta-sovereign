import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkCache } from '../../js/tests/helpers/e2e-vk-cache.mjs';
await reviewVkNative(verifyVkCache, 'docs/screenshots/issue-56-vk-cache');
