import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkToken } from './helpers/e2e-vk-token.mjs';
import { verifyRunnerSessions } from './helpers/e2e-runner-sessions.mjs';
import {
  verifyRunnerProfile,
  verifyLayeredRunnerProfile,
  verifyDockerRunnerProfile,
} from './helpers/e2e-runner-profile.mjs';
import { verifyRunnerHealth } from './helpers/e2e-runner-health.mjs';
import { verifyRunnerFeedback } from './helpers/e2e-runner-feedback.mjs';
await runBrowserScenarios('vk-token', [
  verifyVkToken,
  verifyRunnerSessions,
  verifyRunnerProfile,
  verifyLayeredRunnerProfile,
  verifyDockerRunnerProfile,
  verifyRunnerHealth,
  verifyRunnerFeedback,
]);
