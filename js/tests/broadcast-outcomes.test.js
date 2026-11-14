import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { getSource } from '../src/sources/index.js';
import { broadcastHandler } from '../src/handlers/index.js';
import { createBroadcastApi } from '../src/web/broadcast-api.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const failed = { network: 'vk', ok: false, error: 'permission denied' };
const sent = { network: 'x', ok: true, result: { id: 'published-1' } };
const unknown = {
  network: 'vk',
  ok: false,
  status: 'unknown',
  outcome: 'unknown',
  error: 'response lost',
};

test('browser broadcast keeps network uncertainty separate from no server', async () => {
  const calls = [];
  let response = null;
  const send = createBroadcastApi(async (...args) => {
    calls.push(args);
    return response;
  });
  const ask = () => true;
  assert.equal((await send('hello', ['x'], ask)).status, 'unavailable');
  response = { status: 'failed', code: 'network', error: 'no answer' };
  const interrupted = await send('original', ['x', 'vk'], ask);
  assert.equal(interrupted.status, 'unknown');
  assert.equal(interrupted.body, 'original');
  assert.deepEqual(interrupted.counts, {
    sent: 0,
    failed: 0,
    unknown: 2,
    queued: 0,
  });
  assert.deepEqual(
    interrupted.results.map((item) => item.status),
    ['unknown', 'unknown']
  );
  assert.equal(calls.length, 2, 'a network failure never retries publishing');
  assert.deepEqual(calls[1], [
    '/api/broadcast',
    { text: 'original', networks: ['x', 'vk'] },
    ask,
    { network: true },
  ]);
  response = { status: 'failed', code: 'permission', results: [] };
  assert.equal((await send('refused', ['x'], ask)).status, 'failed');
});

test('broadcast handler persists actual aggregate delivery state', async () => {
  for (const [results, status] of [
    [[failed], 'failed'],
    [[sent, failed], 'partial'],
    [[sent], 'sent'],
    [[unknown], 'unknown'],
    [[{ network: 'x', queued: true }], 'queued'],
    [[sent, unknown], 'partial'],
    [[], 'failed'],
  ]) {
    const store = createMemoryStore();
    const link = { id: 'broadcast:outcomes', status: 'queued', body: 'hello' };
    const { run } = broadcastHandler({ broadcast: async () => results });
    await run({ store, link });
    const saved = await store.get(link.id);
    assert.equal(saved.status, status);
    assert.equal(saved.dispatched, true);
    assert.deepEqual(saved.results, results);
  }
});

test(
  'confirmed text/binary Lino broadcast reports failures and uncertainty without false sent state',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    const sources = ['x', 'vk'].map((name) => getSource(name));
    const originals = sources.map((source) => source.live.post);
    let uncertain = false;
    let attempts = 0;
    sources[0].live.post = async () => {
      attempts++;
      return sent.result;
    };
    sources[1].live.post = async () => {
      attempts++;
      if (uncertain) {
        throw Object.assign(new Error(unknown.error), { ambiguous: true });
      }
      return { ok: false, code: 'permission', error: failed.error };
    };
    const server = await startServer({
      store,
      port: 0,
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      const url = `http://127.0.0.1:${server.port}/api/broadcast`;
      let sequence = 0;
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = async (body) => {
          const response = await fetch(url, {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(body, type),
          });
          return {
            status: response.status,
            data: await readWireResponse(response),
          };
        };
        for (const [networks, expected, mayHaveSent] of [
          [['vk'], 'failed', false],
          [['x', 'vk'], 'partial', false],
          [['x'], 'sent', false],
          [['vk'], 'unknown', true],
        ]) {
          uncertain = mayHaveSent;
          const body = { text: `Outcome probe ${sequence++}`, networks };
          const previous = attempts;
          const preview = await post(body);
          assert.equal(preview.status, 428);
          assert.equal(attempts, previous, 'preview never publishes');
          const result = await post({
            ...body,
            confirmToken: preview.data.confirm.token,
          });
          assert.equal(result.status, 200);
          assert.equal(result.data.status, expected);
          assert.equal((await store.get(result.data.id)).status, expected);
          assert.equal(result.data.results.length, networks.length);
          assert.equal(
            attempts,
            previous + networks.length,
            'each destination is attempted once'
          );
          assert.deepEqual(result.data.counts, {
            sent: networks.includes('x') ? 1 : 0,
            failed: networks.includes('vk') && !uncertain ? 1 : 0,
            unknown: uncertain ? 1 : 0,
            queued: 0,
          });
        }
      }
    } finally {
      await server.close();
      sources.forEach((source, index) => {
        source.live.post = originals[index];
      });
    }
  }
);
