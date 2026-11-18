import { loadPreviousModule } from './previous-module.mjs';

const parent = 'b98098b7d0b55d60557024eab21461068798641a';
for (const file of [
  'cli/startup-configuration.js',
  'cli/vk-online-commands.js',
  'cli/vk-friends-commands.js',
  'server/index.js',
]) {
  loadPreviousModule(parent, `js/src/${file}`);
}
await import('../../js/tests/automation-defaults.test.js');
