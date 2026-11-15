import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkFriends } from './helpers/e2e-vk-friends.mjs';
import { verifyVkDesktopPolicy } from './helpers/e2e-vk-desktop-policy.mjs';
await runBrowserScenarios('vk-friends', [
  verifyVkFriends,
  verifyVkDesktopPolicy,
]);
