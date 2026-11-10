import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { once, EventEmitter } from 'node:events';
import { createFormChannel } from '../src/forms/local-channel.js';
import { encodeWire, decodeWire } from '../src/transport/lino.js';
import {
  createFormKnowledgeBridge,
  formBridgeFile,
} from '../src/forms/knowledge-bridge.js';
import { createMemoryStore } from '../src/storage/universal.js';

const frame = (value) => {
  const bytes = Buffer.from(encodeWire(value));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
};

test('a complete response received before disconnect remains readable', async () => {
  const socket = new EventEmitter();
  socket.setTimeout = () => {};
  const channel = createFormChannel(socket);
  socket.emit('data', frame({ result: { state: 'stopping' } }));
  socket.emit('close');
  assert.deepEqual(await channel.next(), { result: { state: 'stopping' } });
  await assert.rejects(channel.next(), /connection closed/);
});

test(
  'fragmented and coalesced Lino frames decode independently; oversized frames close without allocating their declared body',
  { timeout: 5000 },
  async () => {
    let received;
    let accepted;
    const ready = new Promise((resolve) => {
      accepted = resolve;
    });
    const server = net.createServer((socket) => {
      received = createFormChannel(socket);
      accepted();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const socket = net.connect(server.address().port, '127.0.0.1');
    socket.on('error', () => {});
    await once(socket, 'connect');
    await ready;
    try {
      const one = frame({ text: 'Owner response नमस्ते' });
      const two = frame({ type: 'checked', ok: true });
      socket.write(one.subarray(0, 2));
      socket.write(Buffer.concat([one.subarray(2), two]));
      assert.deepEqual(await received.next(), {
        text: 'Owner response नमस्ते',
      });
      assert.deepEqual(await received.next(), { type: 'checked', ok: true });
      const pending = received.next();
      const header = Buffer.alloc(4);
      header.writeUInt32BE(0xffffffff);
      socket.write(header);
      await assert.rejects(pending, /limit/);
    } finally {
      socket.destroy();
      received?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);

test(
  'the private knowledge bridge refuses an incorrect token before touching knowledge',
  { timeout: 5000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ms-forms-channel-')
    );
    let touched = false;
    const store = createMemoryStore();
    store.put = () => {
      touched = true;
      throw new Error('must not write');
    };
    const bridge = await createFormKnowledgeBridge({ store, directory });
    let channel;
    try {
      const metadata = decodeWire(
        await fs.readFile(formBridgeFile(directory), 'utf8')
      );
      channel = createFormChannel(net.connect(metadata.port, '127.0.0.1'));
      await channel.send({
        version: 1,
        token: '0'.repeat(64),
        operation: 'learn',
        pairs: [],
        profileId: '',
      });
      const result = await channel.next();
      assert.equal(result.type, 'error');
      assert.match(result.error.message, /Invalid form knowledge request/);
      assert.equal(touched, false);
    } finally {
      channel?.close();
      await bridge.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
);
