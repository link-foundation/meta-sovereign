// Actual native sockets and filesystem failure; no substituted wire codec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeServer } from './native-server.mjs';
import { connectSyncWebSocket } from '../../js/src/sync/ws-transport.js';
import { LINO_BINARY } from '../../js/src/transport/lino.js';

test(
  'native socket refuses schema/private records and never ACKs failed persistence',
  { timeout: 30_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-native-refusal-'));
    const binary = resolve(
      process.argv[2] ?? 'rust/target/debug/meta-sovereign-rs'
    );
    const data = join(directory, '.meta-sovereign/native');
    let running;
    const networks = new Set();
    const start = async () => {
      running = await nativeServer(t, binary, { cwd: directory });
    };
    const status = async (id) => {
      const response = await fetch(
        `${running.base}/links/${encodeURIComponent(id)}`,
        {
          signal: t.signal,
          headers: { accept: LINO_BINARY },
        }
      );
      await response.arrayBuffer();
      return response.status;
    };
    const open = async () => {
      const network = await connectSyncWebSocket({
        port: Number(new URL(running.base).port),
        format: LINO_BINARY,
      });
      networks.add(network);
      const events = [];
      network.transport.onMessage((event) => events.push(event));
      const packet = async (type) => {
        for (let attempt = 0; attempt < 500; attempt++) {
          const event = events.find((entry) => entry.type === type);
          if (event) {
            return event;
          }
          await delay(10, undefined, { signal: t.signal });
        }
        assert.fail(`native socket did not send ${type}`);
      };
      return { send: network.transport.send, events, packet };
    };
    try {
      await start();
      const committed = await readFile(join(data, 'CURRENT'), 'utf8');
      const mismatch = await open();
      await mismatch.packet('hello');
      mismatch.send({ type: 'hello', schema: 12 });
      // Adjacent buffered frames must not resume admission after a fatal hello.
      mismatch.send({
        type: 'put',
        schema: 13,
        link: { id: 'after-refusal', vc: { js: 1 }, body: 'must stay absent' },
      });
      await mismatch.packet('sync-abort');
      assert.equal(await status('after-refusal'), 404);
      assert.ok(!mismatch.events.some((event) => event.type === 'sync-ack'));
      const privatePeer = await open();
      await privatePeer.packet('hello');
      privatePeer.send({ type: 'hello', schema: 13 });
      privatePeer.send({
        type: 'put',
        schema: 13,
        link: { id: 'secret:foreign', vc: { js: 1 }, body: 'private' },
      });
      await privatePeer.packet('sync-abort');
      assert.equal(await status('secret:foreign'), 404);
      assert.equal(await readFile(join(data, 'CURRENT'), 'utf8'), committed);
      const peer = await open();
      const hello = await peer.packet('hello');
      peer.send({
        type: 'hello',
        schema: 13,
        reconcile: 1,
        session: 'refusal-probe',
      });
      const pull = await peer.packet('sync-pull');
      const next = (BigInt(committed.trim()) + 1n).toString().padStart(20, '0');
      const blocked = join(data, `${next}.bin`);
      await mkdir(blocked);
      peer.send({
        type: 'sync-record',
        schema: 13,
        from: 'refusal-probe',
        to: hello.session,
        request: pull.request,
        sequence: 0,
        mutation: {
          type: 'put',
          link: { id: 'not-committed', vc: { js: 1 }, body: 'must not ACK' },
        },
      });
      await peer.packet('sync-abort');
      assert.ok(
        !peer.events.some((event) => event.type === 'sync-ack'),
        'failed checkpoint gets no acknowledgement'
      );
      assert.equal(await status('not-committed'), 404);
      assert.equal(await readFile(join(data, 'CURRENT'), 'utf8'), committed);
      await rm(blocked, { recursive: true });
      for (const network of networks) {
        await network.close();
      }
      networks.clear();
      await running.stop();
      await start();
      assert.equal(
        await status('not-committed'),
        404,
        'failed remote write stays absent after reopen'
      );
    } finally {
      for (const network of networks) {
        await network.close();
      }
      await running?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
