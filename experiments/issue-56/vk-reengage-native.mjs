import { verifyVkReengage } from '../../js/tests/helpers/e2e-vk-reengage.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(verifyVkReengage, 'docs/screenshots/issue-56-vk-reengage');
