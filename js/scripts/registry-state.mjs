// Only a registry E404 is evidence that a version is unpublished.
import { spawnSync } from 'node:child_process';

export function npmVersionState(result, version) {
  let data;
  try {
    data = JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error(
      `Registry probe failed: invalid npm JSON (exit ${result.status})`
    );
  }
  if (result.status === 0) {
    if (data !== version) {
      throw new Error(`Unexpected registry version: ${JSON.stringify(data)}`);
    }
    return 'published';
  }
  if (data.error?.code === 'E404') {
    return 'missing';
  }
  throw new Error(
    `Registry probe failed: ${data.error?.code || result.error?.message || result.status}`
  );
}

export function probeNpmVersion(name, version) {
  return npmVersionState(
    spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['view', `${name}@${version}`, 'version', '--json'],
      {
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }
    ),
    version
  );
}
