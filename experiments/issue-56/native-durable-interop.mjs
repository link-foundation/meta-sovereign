// Unchanged CLI startup reproduces lost acknowledged records on the parent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nativeServer } from './native-server.mjs';
import {
  encodeWire,
  decodeWire,
  readWireResponse,
  LINO_BINARY,
  LINO_TEXT,
} from '../../js/src/transport/lino.js';

test(
  'native default CLI retains acknowledged rich writes and deletion across restart',
  { timeout: 30_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-native-durable-'));
    const binary = resolve(
      process.argv[2] ?? 'rust/target/debug/meta-sovereign-rs'
    );
    const data = join(directory, '.meta-sovereign/native');
    let running;
    const start = async () => {
      running = await nativeServer(t, binary, { cwd: directory });
    };
    const request = (method = 'GET', value) =>
      fetch(`${running.base}/links/restart`, {
        method,
        signal: t.signal,
        headers: { accept: LINO_BINARY, 'content-type': LINO_BINARY },
        ...(value ? { body: encodeWire(value, LINO_BINARY) } : {}),
      });
    const put = (value) =>
      fetch(`${running.base}/links`, {
        method: 'PUT',
        signal: t.signal,
        headers: { accept: LINO_BINARY, 'content-type': LINO_BINARY },
        body: encodeWire(value, LINO_BINARY),
      });
    try {
      await start();
      const response = await put({
        id: 'restart',
        body: ['Привет 🚀', { empty: {}, flags: [true, null] }],
      });
      assert.equal(response.status, 200);
      const saved = await readWireResponse(response);
      await running.stop();
      await start();
      const reopened = await request();
      assert.equal(
        reopened.status,
        200,
        'acknowledged owner write survives process termination'
      );
      assert.deepEqual(await readWireResponse(reopened), saved);
      const editedResponse = await put({
        id: 'restart',
        body: 'edited after restart',
      });
      assert.equal(editedResponse.status, 200);
      const edited = await readWireResponse(editedResponse);
      assert.equal(
        Object.keys(edited.vc).length,
        2,
        'each writable opening has a fresh actor'
      );
      assert.equal((await request('DELETE')).status, 200);
      await running.stop();
      await start();
      assert.equal((await request()).status, 404);
      await running.stop();
      const pointer = (await readFile(join(data, 'CURRENT'), 'utf8'))
        .trim()
        .padStart(20, '0');
      const text = decodeWire(
        await readFile(join(data, `${pointer}.lino`), 'utf8'),
        LINO_TEXT
      );
      const binaryCopy = decodeWire(
        await readFile(join(data, `${pointer}.bin`)),
        LINO_BINARY
      );
      assert.deepEqual(text, binaryCopy);
      assert.equal(text.records[0].__msSyncDeleted, 1);
      assert.equal(text.records[0].body, undefined);
      await writeFile(join(data, `${pointer}.lino`), '(');
      await start();
      assert.equal(
        (await request()).status,
        404,
        'valid binary checkpoint recovers a corrupt text copy'
      );
      const committed = await readFile(join(data, 'CURRENT'), 'utf8');
      const next = (BigInt(committed.trim()) + 1n).toString().padStart(20, '0');
      const blocked = join(data, `${next}.bin`);
      await mkdir(blocked);
      const refused = await put({
        id: 'restart',
        body: 'must not be acknowledged',
      });
      assert.equal(refused.status, 503);
      assert.equal(refused.statusText, 'Service Unavailable');
      assert.equal(
        (await readWireResponse(refused)).error,
        'NATIVE_STORAGE_UNAVAILABLE'
      );
      assert.equal(await readFile(join(data, 'CURRENT'), 'utf8'), committed);
      assert.equal((await request()).status, 404);
      await rm(blocked, { recursive: true });
      await running.stop();
      await start();
      assert.equal(
        (await request()).status,
        404,
        'refused recreation stays absent after restart'
      );
    } finally {
      await running?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
