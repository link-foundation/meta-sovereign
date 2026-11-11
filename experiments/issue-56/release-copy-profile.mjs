// One finite immutable snapshot, counting actual filesystem work by phase.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { stageServerRelease } from '../../js/src/server/rolling-release.js';

const dir = await fs.mkdtemp(
  path.join(os.tmpdir(), 'ms-release-copy-profile-')
);
const original = { mkdir: fs.mkdir, copyFile: fs.copyFile };
const counts = { mkdir: 0, copyFile: 0 };
const elapsed = { mkdir: 0, copyFile: 0 };
const directories = new Set();
for (const operation of Object.keys(original)) {
  fs[operation] = async (...args) => {
    counts[operation] += 1;
    if (operation === 'mkdir') {
      directories.add(args[0]);
    }
    const start = performance.now();
    try {
      return await original[operation](...args);
    } finally {
      elapsed[operation] += performance.now() - start;
    }
  };
}
try {
  const start = performance.now();
  const release = await stageServerRelease({ storeDir: dir });
  console.log(
    JSON.stringify({
      build: release.build,
      counts,
      distinctDirectories: directories.size,
      filesystemMs: elapsed,
      totalMs: Math.round(performance.now() - start),
    })
  );
} finally {
  Object.assign(fs, original);
  await fs.rm(dir, { recursive: true, force: true });
}
