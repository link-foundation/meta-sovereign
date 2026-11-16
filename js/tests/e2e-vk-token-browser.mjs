import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkToken } from './helpers/e2e-vk-token.mjs';
import { verifyRunnerSessions } from './helpers/e2e-runner-sessions.mjs';
await runBrowserScenarios('vk-token', [verifyVkToken, verifyRunnerSessions]);
