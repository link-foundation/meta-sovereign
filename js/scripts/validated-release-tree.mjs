#!/usr/bin/env node
// Release commits may change version metadata, never the source that passed CI.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ReleaseTreeChangedError extends Error {}

export function releaseMetadataPath(file) {
  return /^(?:js\/)?(?:package(?:-lock)?\.json|CHANGELOG\.md|\.changeset\/[^/]+\.md)$/.test(
    file
  );
}
export function withoutReleaseVersion(file, text) {
  const data = JSON.parse(text);
  delete data.version;
  if (file.endsWith('package-lock.json') && data.packages?.['']) {
    delete data.packages[''].version;
  }
  return JSON.stringify(data);
}
export function assertValidatedReleaseTree(base, head = 'HEAD') {
  if (!base) {
    throw new Error('The validated source SHA is required');
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const files = git('diff', '--name-only', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    if (!releaseMetadataPath(file)) {
      throw new ReleaseTreeChangedError(
        `Source changed after validation: ${file} (${base} -> ${head})`
      );
    }
    if (
      file.endsWith('.json') &&
      withoutReleaseVersion(file, git('show', `${base}:${file}`)) !==
        withoutReleaseVersion(file, git('show', `${head}:${file}`))
    ) {
      throw new ReleaseTreeChangedError(
        `Package configuration changed after validation: ${file}`
      );
    }
  }
  return files;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assertValidatedReleaseTree(process.argv[2], process.argv[3]);
    console.log(
      'Release source matches the validated tree (version metadata may differ)'
    );
  } catch (error) {
    console.error(error);
    // Only a proven tree difference can mean a superseded desktop run.
    process.exitCode = error instanceof ReleaseTreeChangedError ? 2 : 1;
  }
}
