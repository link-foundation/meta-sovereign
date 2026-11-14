// One tiny file, one delayed reader close. No stress or provider traffic.
import assert from 'node:assert/strict';
import { ReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatLinoRecords,
  readLinoFile,
} from '../../js/src/storage/lino-store.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-reader-lifetime-'));
const file = path.join(dir, 'data.lino');
const original = ReadStream.prototype._destroy;
const started = Promise.withResolvers();
let release;
let delayed;
let pending;
try {
  await fs.writeFile(file, formatLinoRecords([{ id: 'one' }]));
  ReadStream.prototype._destroy = function (error, done) {
    if (this.path === file && !delayed) {
      delayed = this;
      release = () => original.call(this, error, done);
      started.resolve();
    } else {
      original.call(this, error, done);
    }
  };
  let finished = false;
  pending = readLinoFile(file).then((result) => {
    finished = true;
    return result;
  });
  await started.promise;
  // Finite scheduling window; cleanup is released even if the assertion fails.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const evidence = { finished, readerClosed: delayed.closed, fd: delayed.fd };
  console.log(JSON.stringify(evidence));
  release();
  release = null;
  await pending;
  assert.equal(finished, true);
  assert.equal(
    evidence.finished,
    false,
    'file read resolved before reader close'
  );
} finally {
  release?.();
  await pending;
  ReadStream.prototype._destroy = original;
  await fs.rm(dir, { recursive: true, force: true });
}
