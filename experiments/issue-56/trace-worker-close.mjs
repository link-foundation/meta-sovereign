// One tiny file and one worker; bounded 20 ms observation, no stress loop.
import assert from 'node:assert/strict';
import { Worker, parentPort, workerData } from 'node:worker_threads';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (workerData?.file) {
  const handle = await fs.open(workerData.file, 'r');
  parentPort.postMessage({ opened: true, fd: handle.fd });
  await new Promise(() => {});
} else {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-worker-close-'));
  const file = path.join(dir, 'fixture');
  let worker;
  try {
    await fs.writeFile(file, 'one tiny fixture');
    worker = new Worker(new URL(import.meta.url), { workerData: { file } });
    const opened = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    await worker.terminate();
    const target = await fs
      .readlink(`/proc/self/fd/${opened.fd}`)
      .catch(() => null);
    console.log(
      JSON.stringify({
        runtime: process.versions.deno ?? process.version,
        descriptorStillOpenAfterTerminate: target === file,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.notEqual(
      await fs.readlink(`/proc/self/fd/${opened.fd}`).catch(() => null),
      file
    );
  } finally {
    await worker?.terminate();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
