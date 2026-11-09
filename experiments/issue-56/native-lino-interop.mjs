// Real native server plus production JS HTTP and sync codecs. No accounts.
// node experiments/issue-56/native-lino-interop.mjs /path/to/meta-sovereign-rs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  encodeWire,
  decodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
  LINO_TYPES,
} from '../../js/src/transport/lino.js';
import { syncWire } from '../../js/src/sync/wire.js';

test(
  'production JavaScript interoperates with native HTTP and mixed signaling peers',
  { timeout: 30_000 },
  async (t) => {
    const binary = resolve(
      process.argv[2] ?? 'rust/target/debug/meta-sovereign-rs'
    );
    const server = spawn(binary, ['serve', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MS_JSON_COMPATIBILITY: '0',
        MS_LOG_FORMAT: 'none',
      },
    });
    const finished = once(server, 'close');
    const stopped = finished.then(([code]) => {
      throw new Error(`native server exited during startup: ${code}`);
    });
    // A failed spawn must be observed even if readline rejects first.
    stopped.catch(() => {});
    const sockets = [];
    const output = createInterface({ input: server.stdout });
    let stderr = '';
    server.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-65536);
    });
    try {
      const line = (
        await Promise.race([
          once(output, 'line', { signal: t.signal }),
          stopped,
        ])
      )[0];
      const port = Number(line.match(/:(\d+)$/)?.[1]);
      assert.ok(port > 0, `native startup: ${line} ${stderr}`);
      const base = `http://127.0.0.1:${port}`;
      if (!process.argv.includes('--sockets-only')) {
        const status = await fetch(`${base}/api/status`, { signal: t.signal });
        assert.equal(
          status.headers.get('content-type').split(';')[0],
          LINO_TEXT
        );
        assert.equal(
          (await readWireResponse(status)).service,
          'meta-sovereign'
        );
        const vectors = JSON.parse(
          await readFile(
            'rust/crates/meta-sovereign-server/tests/fixtures/lino-wire.json',
            'utf8'
          )
        );
        for (const { value } of vectors) {
          for (const type of LINO_TYPES) {
            const body = encodeWire(value, type);
            const response = await fetch(`${base}/links`, {
              method: 'PUT',
              headers: { 'content-type': type, accept: type },
              body,
              signal: t.signal,
            });
            assert.equal(response.status, 200, type);
            assert.deepEqual(await readWireResponse(response), value, type);
          }
        }
        const json = await fetch(`${base}/links`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: '{"id":"forbidden"}',
          signal: t.signal,
        });
        assert.equal(json.status, 415);
        assert.equal((await readWireResponse(json)).code, 'unsupported-media');
      }

      const open = async (type) => {
        const wire = syncWire({ format: type });
        const socket = new globalThis.WebSocket(
          `ws://127.0.0.1:${port}/rtc?room=fixture`,
          wire.protocol
        );
        sockets.push(socket);
        socket.binaryType = 'arraybuffer';
        await Promise.race([
          once(socket, 'open', { signal: t.signal }),
          once(socket, 'error', { signal: t.signal }).then(() => {
            throw new Error('native socket handshake rejected');
          }),
        ]);
        assert.equal(socket.protocol, wire.protocol);
        return socket;
      };
      const text = await open(LINO_TEXT);
      const joined = once(text, 'message', { signal: t.signal });
      const binaryPeer = await open(LINO_BINARY);
      assert.equal(
        decodeWire((await joined)[0].data, LINO_TEXT).type,
        'peer-joined'
      );
      const offer = {
        type: 'offer',
        sdp: 'fake fixture 🚀\r\nПривет',
        nested: [{ single: [true], empty: {} }],
      };
      const receivedText = once(text, 'message', { signal: t.signal });
      binaryPeer.send(encodeWire(offer, LINO_BINARY));
      assert.deepEqual(
        decodeWire((await receivedText)[0].data, LINO_TEXT),
        offer
      );
      const receivedBinary = once(binaryPeer, 'message', { signal: t.signal });
      text.send(encodeWire(offer, LINO_TEXT));
      assert.deepEqual(
        decodeWire((await receivedBinary)[0].data, LINO_BINARY),
        offer
      );
    } finally {
      output.close();
      const closed = sockets.map((socket) =>
        socket.readyState === 3 ? Promise.resolve() : once(socket, 'close')
      );
      server.kill('SIGTERM');
      await finished;
      await Promise.all(closed);
    }
  }
);
