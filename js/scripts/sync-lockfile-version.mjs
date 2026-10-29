// A release changes versions, never the dependency graph that passed CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { getPackageJsonPath, getPackageLockPath } from './js-paths.mjs';
import { debug } from './debug-print.mjs';

export function syncLockfileVersion(options = {}) {
  const manifest = JSON.parse(
    readFileSync(getPackageJsonPath(options), 'utf8')
  );
  const file = getPackageLockPath(options);
  const lock = JSON.parse(readFileSync(file, 'utf8'));
  const root = lock.packages?.[''];
  if (
    ![2, 3].includes(lock.lockfileVersion) ||
    !root ||
    typeof manifest.version !== 'string' ||
    !manifest.version ||
    lock.name !== manifest.name ||
    root.name !== manifest.name
  ) {
    throw new Error(
      `Cannot synchronize inconsistent or unsupported lockfile: ${file}`
    );
  }
  const previousVersion = lock.version;
  lock.version = manifest.version;
  root.version = manifest.version;
  writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
  debug('Synchronized release lockfile version without dependency resolution', {
    file,
    previousVersion,
    version: manifest.version,
    packages: Object.keys(lock.packages).length,
  });
}
