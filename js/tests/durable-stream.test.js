import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { writeStreamDurable } from '../src/storage/durable.js';

test(
  'an immediate source error closes the destination before removing its temp file',
  { timeout: 10000 },
  async (t) => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ms-stream-close-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    // Small, finite attempts expose ordering differences in runtime file opens.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const source = new Readable({
        read() {
          this.destroy(new Error('source unavailable'));
        },
      });
      await assert.rejects(
        writeStreamDurable(
          join(dir, 'archive'),
          source,
          createGzip(),
          async function* (input) {
            yield 'header';
            yield* input;
          }
        ),
        /source unavailable/
      );
      assert.deepEqual(await fs.readdir(dir), []);
    }
  }
);
