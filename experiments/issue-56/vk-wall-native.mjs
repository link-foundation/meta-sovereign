import { verifyVkWall } from '../../js/tests/helpers/e2e-vk-wall.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(verifyVkWall, 'docs/screenshots/issue-56-vk-wall');
