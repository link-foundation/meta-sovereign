import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkSendQueue } from '../../js/tests/helpers/e2e-vk-send-queue.mjs';
await reviewVkNative(verifyVkSendQueue, 'docs/screenshots/issue-56-vk-queue');
