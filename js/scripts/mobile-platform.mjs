#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [platform, action = 'open'] = process.argv.slice(2);
const valid = new Set(['ios', 'android']);
const actions = new Set(['open', 'sync']);
const cliPackage = '@capacitor/cli@^7.6.2';
if (platform !== 'sync' && (!valid.has(platform) || !actions.has(action))) {
  console.error(
    'usage: node js/scripts/mobile-platform.mjs <ios|android> [open|sync]\n       node js/scripts/mobile-platform.mjs sync'
  );
  process.exit(1);
}

const run = (args) => {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['exec', '--yes', '--package', cliPackage, '--', 'cap', ...args],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (platform === 'sync') {
  run(['sync']);
  process.exit(0);
}

if (!existsSync(platform)) {
  run(['add', platform]);
}
run(['sync', platform]);
if (action === 'open') {
  run(['open', platform]);
}
