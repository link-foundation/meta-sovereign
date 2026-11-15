import { reviewVkNative } from './vk-native-review.mjs';
import { verifyRunnerLog } from '../../js/tests/helpers/e2e-runner-log.mjs';
await reviewVkNative(verifyRunnerLog, 'docs/screenshots/issue-56-runner-log');
