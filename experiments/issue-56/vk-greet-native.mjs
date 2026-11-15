import { verifyVkGreet } from '../../js/tests/helpers/e2e-vk-greet.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(verifyVkGreet, 'docs/screenshots/issue-56-vk-greet');
