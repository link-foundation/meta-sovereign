// Only a registry E404 is evidence that a version is unpublished.
import { spawnCommandSync } from './command-process.mjs';

export function npmPackEntry(stdout, name) {
  const entry = JSON.parse(stdout)[name];
  if (entry?.name !== name || !entry.filename || !Array.isArray(entry.files)) {
    throw new Error(`Unexpected npm pack metadata for ${name}`);
  }
  return entry;
}

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
    const versions = Array.isArray(data) ? data : [data];
    if (versions.length !== 1 || versions[0] !== version) {
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
