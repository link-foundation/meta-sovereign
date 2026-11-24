import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationRejections } from '../../js/tests/helpers/e2e-application-chats.mjs';
import { verifyChangedRejectionPreview } from './application-chat-rejection-preview.mjs';

await runBrowserScenarios(
  'job-application-chat-rejections',
  [verifyChangedRejectionPreview, verifyNativeApplicationRejections],
  { nativeFocus: true }
);
