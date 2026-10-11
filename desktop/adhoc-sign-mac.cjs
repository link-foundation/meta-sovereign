'use strict';

// Ad-hoc macOS signing for builds without a Developer ID certificate
// (issue #37). Apple silicon refuses to run unsigned executables, but
// "a simple ad-hoc signature is sufficient", so the desktop release
// workflow passes this file as `-c.mac.sign=` (together with
// `-c.mac.notarize=false`) when the signing secrets are not configured.
//
// Same approach as konard/vk-bot-desktop's `scripts/adhoc-sign-mac.cjs`:
// `@electron/osx-sign` with identity `-`, no identity validation and no
// secure timestamp (ad-hoc signatures cannot be timestamped). The
// bundle is then verified so a broken signature fails the build
// instead of shipping an app macOS reports as "damaged".

const { spawnSync } = require('node:child_process');
const { signAsync } = require('@electron/osx-sign');

const findAppPath = (signOptions) => {
  for (const field of ['app', 'appPath', 'path']) {
    const value = signOptions[field];
    if (typeof value === 'string' && value.endsWith('.app')) {
      return value;
    }
  }
  throw new Error(
    `Could not find the .app bundle in signing options: ${Object.keys(
      signOptions
    )
      .sort()
      .join(', ')}`
  );
};

const verify = (appPath) => {
  const result = spawnSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { encoding: 'utf8' }
  );
  process.stderr.write(`[adhoc-sign-mac] ${result.stderr ?? ''}\n`);
  if (result.status !== 0) {
    throw new Error(`codesign --verify failed for ${appPath}`);
  }
};

module.exports = async function adhocSignMac(signOptions) {
  if (process.env.MACOS_ADHOC_SIGN !== '1') {
    throw new Error('Ad-hoc macOS signing must be enabled explicitly.');
  }
  const upstreamOptionsForFile = signOptions.optionsForFile;
  await signAsync({
    ...signOptions,
    identity: '-',
    identityValidation: false,
    provisioningProfile: undefined,
    timestamp: 'none',
    optionsForFile(filePath) {
      const fileOptions = upstreamOptionsForFile
        ? upstreamOptionsForFile(filePath)
        : {};
      return { ...fileOptions, timestamp: 'none' };
    },
  });
  verify(findAppPath(signOptions));
};
