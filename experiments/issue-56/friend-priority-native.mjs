import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkFriendPriority } from '../../js/tests/helpers/e2e-vk-friend-priority.mjs';
await reviewVkNative(
  verifyVkFriendPriority,
  'docs/screenshots/issue-56-friend-priority'
);
