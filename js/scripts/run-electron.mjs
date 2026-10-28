#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnCommandSync } from './command-process.mjs';

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const result = spawnCommandSync(
  'npm',
  [
    'exec',
    '--yes',
    '--package',
    `electron@${pkg.peerDependencies.electron}`,
    '--',
    'electron',
    'js/electron/main.js',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);
process.exitCode = result.status ?? 1;
