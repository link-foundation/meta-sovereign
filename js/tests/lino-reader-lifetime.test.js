import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { ownedLines } from '../src/storage/read-lines.js';

for (const early of [true, false]) {
  test(
    `owned line reader awaits input close after ${early ? 'early return' : 'EOF'}`,
    { timeout: 5000 },
    async () => {
      const started = Promise.withResolvers();
      let release;
      const input = new PassThrough({
        destroy: (error, done) => {
          release = () => done(error);
          started.resolve();
        },
      });
      input.end('one\ntwo\n');
      let finished = false;
      const consume = async () => {
        const lines = [];
        for await (const line of ownedLines(input)) {
          lines.push(line);
          if (early) {
            break;
          }
        }
        finished = true;
        return lines;
      };
      const pending = consume();
      let beforeClose;
      try {
        await started.promise;
        await new Promise((resolve) => setTimeout(resolve, 0));
        beforeClose = finished;
      } finally {
        release?.();
      }
      assert.deepEqual(await pending, early ? ['one'] : ['one', 'two']);
      assert.equal(beforeClose, false);
      assert.equal(input.closed, true);
    }
  );
}

test(
  'owned line reader preserves errors while awaiting descriptor cleanup',
  { timeout: 5000 },
  async () => {
    const input = new PassThrough();
    const pending = (async () => {
      for await (const line of ownedLines(input)) {
        assert.equal(line, 'one');
        input.destroy(new Error('fixture read failure'));
      }
    })();
    input.write('one\n');
    await assert.rejects(pending, /fixture read failure/u);
    assert.equal(input.closed, true);
  }
);
