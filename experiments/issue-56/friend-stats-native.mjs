import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkFriendStats } from '../../js/tests/helpers/e2e-vk-friend-stats.mjs';
await reviewVkNative(
  verifyVkFriendStats,
  'docs/screenshots/issue-56-friend-stats'
);
