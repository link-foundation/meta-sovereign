import { verifyVkBirthday } from '../../js/tests/helpers/e2e-vk-birthday.mjs';
import { reviewVkNative } from './vk-native-review.mjs';
await reviewVkNative(verifyVkBirthday, 'docs/screenshots/issue-56-vk-birthday');
