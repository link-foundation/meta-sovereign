/**
 * Writes the binary snapshot (`data.bin`) of a text log (`data.lino`)
 * off the server's thread (see `doublets-mirror.js`): the encoding of a
 * large store takes seconds and a heap of its own, and neither blocks
 * nor endangers the server. Reads `workerData.from`, writes
 * `workerData.to` through a temp file, and reports `{ links, bytes }`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import { Readable } from 'node:stream';
import {
  writeStreamDurable,
  fsyncFile,
  renameDurable,
  fsyncDir,
} from './durable.js';
import { forEachLiveRecord, readLinoFile } from './lino-store.js';
import {
  createNetworkEncoder,
  linksArchivePackets,
} from './doublets-archive.js';
import { packetChunks } from './binary-packet-stream.js';
import { createWorkBudget } from './work-budget.js';
import { createDiskNetwork } from './disk-network.js';

const { from, to } = workerData;
const yieldWork = createWorkBudget();
const encoder = workerData.diskFile
  ? await createDiskNetwork(workerData.diskFile)
  : createNetworkEncoder();
if (!encoder) {
  throw new Error('snapshot SQLite runtime unavailable');
}
let stage = 'opening';
const report = globalThis.setInterval(() => {
  const { heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  parentPort.postMessage({
    progress: true,
    stage,
    memory: { heapUsed, heapTotal, external, arrayBuffers },
  });
}, 5000);
report.unref?.();

// The network of the log's live links, encoded as they are read: the
// store is never held decoded here as well (it did not fit beside the
// encoding once the log passed a gigabyte). A log in the legacy format
// is small, and read whole.
const networkOf = async (file) => {
  const read = await forEachLiveRecord(file, (record) => encoder.add(record), {
    yieldWork,
    positions: encoder.positions,
    onPhase: (next) => {
      stage = next;
    },
  });
  if (read) {
    return { ...read, network: encoder.finish?.() };
  }
  const { mtime } = await fs.stat(file);
  const { live } = await readLinoFile(file);
  live.forEach((record) => encoder.add(record));
  return { links: live.length, mtime, network: encoder.finish?.() };
};

// The snapshot is dated as the log it was read from, so a later append
// leaves it older than the log (and it is written again). No log (no
// links stored yet, or removed meanwhile): nothing to snapshot.
try {
  const { links, mtime, network } = await networkOf(from);
  if (mtime === null) {
    parentPort.postMessage({ links: 0, bytes: 0 });
  } else {
    stage = 'writing';
    let bytes = 0;
    const chunks = async function* () {
      for (const packet of encoder.packets?.() ??
        linksArchivePackets(network)) {
        for await (const chunk of packetChunks(packet, { yieldWork })) {
          bytes += chunk.length;
          yield chunk;
        }
      }
    };
    // One temp file per worker: two stores over one folder may snapshot at
    // the same time, and must not rename each other's file away.
    // Flushed before the rename, and the folder after it (R-Z2).
    // Dated half a millisecond into the log's millisecond: the comparison is
    // in whole milliseconds, and Deno turns seconds into a time rounding down,
    // which would leave the snapshot a millisecond older than its log.
    const at = mtime.getTime() / 1000 + 0.0005;
    const staged = `${to}.${process.pid}.${threadId}.snapshot.tmp`;
    try {
      await writeStreamDurable(staged, Readable.from(chunks()));
      await fs.utimes(staged, at, at);
      await fsyncFile(staged);
      await renameDurable(staged, to);
      await fsyncDir(path.dirname(to));
    } finally {
      await fs.unlink(staged).catch(() => {});
    }
    parentPort.postMessage({
      links,
      bytes,
      engine: workerData.diskFile ? 'disk' : 'memory',
    });
  }
} finally {
  globalThis.clearInterval(report);
  encoder.close?.();
}
