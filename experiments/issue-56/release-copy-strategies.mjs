// Two finite actual-package snapshots on an isolated hosted fixture. Run after
// the real tests, so this observation cannot warm their initial startup path.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stageServerRelease } from '../../js/src/server/rolling-release.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-copy-method-'));
const original = fs.copyFile;
let expectedBuild;
try {
  for (const method of ['copyFile', 'buffered']) {
    const started = globalThis.performance.now();
    let copies = 0;
    let bytes = 0;
    let maximum = 0;
    let active = 0;
    let operationMs = 0;
    let slowestMs = 0;
    fs.copyFile = async (source, destination) => {
      const size = (await fs.stat(source)).size;
      copies += 1;
      bytes += size;
      if (copies > 4096 || bytes > 128 * 1024 * 1024) {
        throw new Error('copy probe exceeds its finite package budget');
      }
      active += 1;
      maximum = Math.max(maximum, active);
      const began = globalThis.performance.now();
      try {
        if (method === 'buffered' && size <= 8 * 1024 * 1024) {
          await fs.writeFile(destination, await fs.readFile(source));
        } else {
          await original(source, destination);
        }
      } finally {
        const elapsed = globalThis.performance.now() - began;
        operationMs += elapsed;
        slowestMs = Math.max(slowestMs, elapsed);
        active -= 1;
      }
    };
    const release = await stageServerRelease({
      storeDir: path.join(directory, method),
    });
    expectedBuild ??= release.build;
    assert.equal(release.build, expectedBuild);
    assert.equal(active, 0);
    console.log(
      '[release-copy-method]',
      JSON.stringify({
        method,
        runtime: process.versions.deno ? 'deno' : 'node',
        platform: process.platform,
        copies,
        bytes,
        maximum,
        operationMs: Math.round(operationMs),
        slowestMs: Math.round(slowestMs),
        totalMs: Math.round(globalThis.performance.now() - started),
      })
    );
  }
} finally {
  fs.copyFile = original;
  await fs.rm(directory, { recursive: true, force: true });
}
