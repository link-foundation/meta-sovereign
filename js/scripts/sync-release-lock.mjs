import { execCommandSync } from './command-process.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function syncReleaseLock(jsRoot) {
  const { version } = JSON.parse(
    readFileSync(join(jsRoot, 'package.json'), 'utf8')
  );
  // npm version updates release metadata without resolving or pruning peers.
  // Changesets/the caller already updated package.json and own the Git commit.
  execCommandSync(
    'npm',
    [
      'version',
      version,
      '--allow-same-version',
      '--no-git-tag-version',
      '--ignore-scripts',
    ],
    { cwd: jsRoot, stdio: 'inherit' }
  );
}
