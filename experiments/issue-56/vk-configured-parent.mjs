import { loadPreviousModule } from './previous-module.mjs';

// Preserve the published implementations together, including their exports.
for (const file of [
  'automation/vk-friends-settings.js',
  'automation/vk-friend-quota.js',
  'automation/vk-friends-planner.js',
  'automation/vk-friends-executor.js',
]) {
  loadPreviousModule(
    '132c16f69ea61e22cd7d9e2c3fbcead90a329686',
    `js/src/${file}`
  );
}
await import('../../js/tests/vk-configured-policy.test.js');
