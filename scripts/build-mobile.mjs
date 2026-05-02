#!/usr/bin/env node

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'src', 'web');
const outRoot = path.join(root, 'mobile', 'www');
const files = [
  'index.html',
  'app.css',
  'app.min.js',
  'discovery-shell.js',
  'pattern-worker.js',
  'patterns-wasm.js',
  'pattern-matcher.wasm',
];

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });
for (const file of files) {
  await cp(path.join(webRoot, file), path.join(outRoot, file));
}

await writeFile(
  path.join(outRoot, 'meta-sovereign-mobile.json'),
  `${JSON.stringify(
    {
      appId: 'foundation.link.meta.sovereign',
      discovery:
        'Pass LAN server candidates through window.metaSovereignShell.discoveryCandidates before app.min.js loads.',
      generatedFrom: 'scripts/build-mobile.mjs',
    },
    null,
    2
  )}\n`
);

console.log(`mobile web assets written to ${path.relative(root, outRoot)}`);
