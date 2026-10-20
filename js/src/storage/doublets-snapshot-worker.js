/**
 * Writes the binary snapshot (`data.bin`) of a text log (`data.lino`)
 * off the server's thread (see `doublets-mirror.js`): the encoding of a
 * large store takes seconds and a heap of its own, and neither blocks
 * nor endangers the server. Reads `workerData.from`, writes
 * `workerData.to` through a temp file, and reports `{ links, bytes }`.
 */

import { promises as fs } from 'node:fs';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import { readLinoFile } from './lino-store.js';
import { encodeArchive } from './doublets-archive.js';

const { from, to } = workerData;
// The snapshot is dated as the log it was read from, so a later append
// leaves it older than the log (and it is written again).
const { mtime } = await fs.stat(from);
const { live } = await readLinoFile(from);
const bytes = encodeArchive(live);
// One temp file per worker: two stores over one folder may snapshot at
// the same time, and must not rename each other's file away.
const tmp = `${to}.${process.pid}.${threadId}.snapshot.tmp`;
await fs.writeFile(tmp, bytes);
await fs.utimes(tmp, mtime, mtime);
await fs.rename(tmp, to);
parentPort.postMessage({ links: live.length, bytes: bytes.length });
