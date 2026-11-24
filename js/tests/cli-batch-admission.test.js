import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli/index.js';
import { decodeWire } from '../src/transport/lino.js';

test(
  'public batch CLI reaches file validation and reads an empty saved status',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'batch-admission-'));
    const store = join(directory, 'workspace');
    const output = [];
    const options = { log: (text) => output.push(text) };
    try {
      await assert.rejects(
        runCli(
          [
            'vacancies-application-batch',
            `--store=${store}`,
            `--vacancies-file=${join(directory, 'missing.txt')}`,
          ],
          options
        ),
        { code: 'ENOENT' }
      );
      await assert.rejects(stat(store), { code: 'ENOENT' });
      assert.deepEqual(output, []);
      assert.equal(
        await runCli(
          ['vacancies-application-batch-status', `--store=${store}`],
          options
        ),
        0
      );
      assert.equal(output.length, 1);
      const receipt = decodeWire(output[0]);
      assert.deepEqual(receipt, {
        ok: true,
        mode: 'hh-application-batch',
        batch: null,
        application: null,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
