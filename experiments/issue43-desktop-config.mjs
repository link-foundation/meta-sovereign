// Validate the pinned installed builder's schema without building an app.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { DebugLogger } from 'builder-util';
import { validateConfiguration } from 'app-builder-lib/internal';
const require = createRequire(import.meta.url);
const config = require('../desktop/electron-builder.config.cjs');
await validateConfiguration(config, new DebugLogger(false));
console.log(
  'Desktop configuration passes the installed electron-builder schema.'
);

const version = execFileSync(
  'npx',
  ['--no-install', 'electron-builder', '--version'],
  {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }
).trim();
assert.match(version, /^27\.0\.0-alpha\.13$/);
console.log(`Builder provenance version: ${version}`);
