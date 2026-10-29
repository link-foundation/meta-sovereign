#!/usr/bin/env node
// Keep the publisher runtime explicit. No unauthenticated curl-to-execute fallbacks.
import { execCommandSync } from './command-process.mjs';
const npm = 'npm';
const version = execCommandSync(npm, ['--version'], {
  encoding: 'utf8',
}).trim();
const [major, minor, patch] = version.split('.').map(Number);
if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) {
  throw new Error(
    `npm ${version} cannot use trusted publishing. Select the pinned Node 26.13.0 and npm 12.2.1 toolchain.`
  );
}
console.log(`npm ${version} supports OIDC trusted publishing`);
