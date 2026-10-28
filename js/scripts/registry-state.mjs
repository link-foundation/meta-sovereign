// Only a registry E404 is evidence that a version is unpublished.
import { spawnCommandSync } from './command-process.mjs';

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
    spawnCommandSync(
      'npm',
      [
        'view',
        `${name}@${version}`,
        'version',
        '--json',
        '--fetch-retries=0',
        '--fetch-timeout=15000',
      ],
      {
        encoding: 'utf8',
      }
    ),
    version
  );
}
