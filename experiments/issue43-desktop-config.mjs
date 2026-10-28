// Validate the pinned installed builder's schema without building an app.
import { createRequire } from 'node:module';
import { DebugLogger } from 'builder-util';
import { validateConfiguration } from 'app-builder-lib/internal';
const require = createRequire(import.meta.url);
const config = require('../desktop/electron-builder.config.cjs');
await validateConfiguration(config, new DebugLogger(false));
console.log(
  'Desktop configuration passes the installed electron-builder schema.'
);
