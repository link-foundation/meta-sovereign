import { reviewVkNative } from './vk-native-review.mjs';
import { verifyDiagnostics } from '../../js/tests/helpers/e2e-diagnostics.mjs';
await reviewVkNative(
  verifyDiagnostics,
  'docs/screenshots/issue-56-diagnostics'
);
