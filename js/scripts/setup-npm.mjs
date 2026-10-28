#!/usr/bin/env node
// Keep the publisher runtime explicit. No unauthenticated curl-to-execute fallbacks.
import { execFileSync } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const version = execFileSync(npm, ['--version'], { encoding: 'utf8' }).trim();
const [major, minor, patch] = version.split('.').map(Number);
if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) {
  throw new Error(
    `npm ${version} cannot use trusted publishing. Select Node 24 with npm >= 11.5.1.`
  );
}
console.log(`npm ${version} supports OIDC trusted publishing`);
