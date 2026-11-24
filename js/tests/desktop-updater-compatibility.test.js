// Exercise the installed builder's actual metadata gate without packaging or
// downloading Electron. Existing updater-6 installations must read our feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { desktopPackageJson } from '../scripts/prepare-desktop.mjs';

const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const entry = pathToFileURL(builder.resolve('app-builder-lib'));
const { checkMetadata } = await import(
  new URL('./util/packageMetadata.js', entry)
);
const { electronUpdaterRequirements } = await import(
  new URL('./util/electronUpdaterCompatibility.js', entry)
);
const config = require('../../desktop/electron-builder.config.cjs');
const metadata = desktopPackageJson(require('../../package.json'));

const validate = (settings) => {
  const targets = new Map(
    ['linux', 'mac', 'win'].map((key) => [
      { name: key, buildConfigurationKey: key },
      new Set(settings[key].target),
    ])
  );
  const requirements = electronUpdaterRequirements(settings, targets);
  checkMetadata(
    metadata,
    metadata,
    '/fixture/package.json',
    '/fixture/package.json',
    '/fixture',
    requirements
  );
  return requirements;
};

test('desktop builds pass the builder gate and preserve updater-6 block maps', () => {
  const { electronUpdaterCompatibility: _compatibility, ...defaults } = config;
  assert.throws(
    () => validate(defaults),
    /does not satisfy electronUpdaterCompatibility/
  );
  const requirements = validate(config);
  assert.equal(requirements.length, 3);
  assert.ok(requirements.every((entry) => !entry.binaryBlockMap));
});
