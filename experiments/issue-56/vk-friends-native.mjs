import { verifyVkFriends } from '../../js/tests/helpers/e2e-vk-friends.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(verifyVkFriends, 'docs/screenshots/issue-56-vk-friends');
