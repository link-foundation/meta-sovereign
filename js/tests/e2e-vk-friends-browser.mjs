import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVkFriends } from './helpers/e2e-vk-friends.mjs';
import { verifyVkFriendPriority } from './helpers/e2e-vk-friend-priority.mjs';
import { verifyVkFriendStats } from './helpers/e2e-vk-friend-stats.mjs';
import { verifyVkDesktopPolicy } from './helpers/e2e-vk-desktop-policy.mjs';
import { verifyVkCancelled } from './helpers/e2e-vk-cancelled.mjs';
import { verifyVkGreet } from './helpers/e2e-vk-greet.mjs';
import { verifyVkReengage } from './helpers/e2e-vk-reengage.mjs';
import { verifyVkWall } from './helpers/e2e-vk-wall.mjs';
import { verifyVkWallParity } from './helpers/e2e-vk-wall-parity.mjs';
import { verifyVkBirthday } from './helpers/e2e-vk-birthday.mjs';
import { verifyVkRetention } from './helpers/e2e-vk-retention.mjs';
import { verifyVkDiscovery } from './helpers/e2e-vk-discovery.mjs';
import { verifyVkCache } from './helpers/e2e-vk-cache.mjs';
import { verifyVkStickers } from './helpers/e2e-vk-stickers.mjs';
import { verifyDiagnostics } from './helpers/e2e-diagnostics.mjs';
import { verifyVkSendQueue } from './helpers/e2e-vk-send-queue.mjs';
await runBrowserScenarios('vk-friends', [
  verifyVkFriends,
  verifyVkFriendPriority,
  verifyVkFriendStats,
  verifyVkDesktopPolicy,
  verifyVkCancelled,
  verifyVkGreet,
  verifyVkReengage,
  verifyVkWall,
  verifyVkWallParity,
  verifyVkBirthday,
  verifyVkRetention,
  verifyVkDiscovery,
  verifyVkCache,
  verifyVkStickers,
  verifyVkSendQueue,
  verifyDiagnostics,
]);
