import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkStickers } from '../../js/tests/helpers/e2e-vk-stickers.mjs';
await reviewVkNative(verifyVkStickers, 'docs/screenshots/issue-56-vk-stickers');
