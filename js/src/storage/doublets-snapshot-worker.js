/**
 * Writes the binary snapshot (`data.bin`) of a text log (`data.lino`)
 * off the server's thread (see `doublets-mirror.js`): the encoding of a
 * large store takes seconds and a heap of its own, and neither blocks
 * nor endangers the server. Reads `workerData.from`, writes
 * `workerData.to` through a temp file, and reports `{ links, bytes }`.
 */

import { promises as fs } from 'node:fs';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import { forEachLiveRecord, readLinoFile } from './lino-store.js';
import {
  createNetworkEncoder,
  encodeLinksArchive,
} from './doublets-archive.js';

const { from, to } = workerData;

// The network of the log's live links, encoded as they are read: the
// store is never held decoded here as well (it did not fit beside the
// encoding once the log passed a gigabyte). A log in the legacy format
// is small, and read whole.
const networkOf = async (file) => {
  const encoder = createNetworkEncoder();
  const read = await forEachLiveRecord(file, (record) => encoder.add(record));
  if (read) {
    return { ...read, network: encoder.finish() };
  }
  const { mtime } = await fs.stat(file);
  const { live } = await readLinoFile(file);
  live.forEach((record) => encoder.add(record));
  return { links: live.length, mtime, network: encoder.finish() };
};

// The snapshot is dated as the log it was read from, so a later append
// leaves it older than the log (and it is written again). No log (no
// links stored yet, or removed meanwhile): nothing to snapshot.
const { links, mtime, network } = await networkOf(from);
if (mtime === null) {
  parentPort.postMessage({ links: 0, bytes: 0 });
} else {
  const bytes = encodeLinksArchive(network);
  // One temp file per worker: two stores over one folder may snapshot at
  // the same time, and must not rename each other's file away.
  const tmp = `${to}.${process.pid}.${threadId}.snapshot.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.utimes(tmp, mtime, mtime);
  await fs.rename(tmp, to);
  parentPort.postMessage({ links, bytes: bytes.length });
}
