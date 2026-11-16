import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkToken } from './helpers/e2e-vk-token.mjs';
import { verifyRunnerSessions } from './helpers/e2e-runner-sessions.mjs';
import { verifyRunnerProfile } from './helpers/e2e-runner-profile.mjs';
import { verifyRunnerHealth } from './helpers/e2e-runner-health.mjs';
await runBrowserScenarios('vk-token', [
  verifyVkToken,
  verifyRunnerSessions,
  verifyRunnerProfile,
  verifyRunnerHealth,
]);
