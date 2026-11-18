import { verifyVkWall } from '../../js/tests/helpers/e2e-vk-wall.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(
  (browser, options) =>
    verifyVkWall(browser, {
      ...options,
      before: false,
      beforeMedia: options.before,
    }),
  'docs/screenshots/issue-56-vk-friend-invitations'
);
