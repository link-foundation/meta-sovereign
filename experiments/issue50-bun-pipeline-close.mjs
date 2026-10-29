// Standalone bounded Bun/Node contrast: no project imports or dependencies.
import assert from 'node:assert/strict';
import { createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const dir = await fs.mkdtemp(join(tmpdir(), 'bun-pipeline-close-'));
console.log({ node: process.version, bun: globalThis.Bun?.version });
try {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const events = [];
    const temp = join(dir, 'archive.tmp');
    const output = createWriteStream(temp, { flags: 'w', mode: 0o600 });
    const source = new Readable({
      read() {
        this.destroy(new Error('source unavailable'));
      },
    });
    try {
      await assert.rejects(
        pipeline(
          source,
          createGzip(),
          async function* (input) {
            yield 'header';
            yield* input;
          },
          output
        ),
        /source unavailable/
      );
      events.push(`rejected: closed=${output.closed}`);
      await fs.unlink(temp).catch((error) => {
        assert.equal(error.code, 'ENOENT');
        events.push('unlink: ENOENT');
      });
      const remaining = await fs.readdir(dir);
      if (remaining.length) {
        console.log({ attempt, events, remaining });
      }
      assert.deepEqual(remaining, []);
    } finally {
      const closed = output.closed
        ? Promise.resolve()
        : new Promise((resolve) => output.once('close', resolve));
      output.destroy();
      await closed;
      await fs.unlink(temp).catch(() => {});
    }
  }
  console.log('No temporary files remain after failed pipelines');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
