import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationPanel } from './helpers/e2e-application-panel.mjs';
import { verifyNativeApplicationAnswerApproval } from './helpers/e2e-application-answer-approval.mjs';
import {
  verifyNativeApplication,
  verifyNativeApplicationGuards,
  verifyNativeApplicationRecovery,
} from './helpers/e2e-job-application.mjs';
const scenarios = [
  verifyNativeApplication,
  verifyNativeApplicationGuards,
  verifyApplicationPanel,
  verifyNativeApplicationRecovery,
  verifyNativeApplicationAnswerApproval,
];
await runBrowserScenarios(
  'job-application',
  process.env.APPLICATION_ANSWER_APPROVAL_ONLY === '1'
    ? [verifyNativeApplicationAnswerApproval]
    : scenarios
);
