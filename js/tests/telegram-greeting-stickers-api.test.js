import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  greetingStickerFixture,
  catalogFinished,
} from './helpers/greeting-stickers-fakes.mjs';

test('catalog uses actual text and binary Lino routes, with explicit capabilities and origin checks', async (t) => {
  const fixture = greetingStickerFixture();
  const handle = await startServer({
    store: fixture.store,
    port: 0,
    enableHandlers: false,
    enableSync: false,
    automations: { scheduler: false },
    telegramAccount: {
      ...fixture.catalog,
      status: async () => ({ connected: true, kind: 'user' }),
      stop: fixture.env.greetingStickersStop,
    },
  });
  t.after(() => handle.close());
  const origin = `http://127.0.0.1:${handle.port}`;
  const status = await readWireResponse(
    await fetch(`${origin}/api/telegram/status`)
  );
  assert.equal(status.capabilities.greetingStickersRefresh, true);
  for (const type of [LINO_TEXT, LINO_BINARY]) {
    const post = (name, body, headers = {}) =>
      fetch(`${origin}/api/telegram/${name}`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type, ...headers },
        body: encodeWire(body, type),
      });
    const denied = await post(
      'greeting-stickers-refresh',
      {},
      { origin: 'https://untrusted.invalid' }
    );
    assert.equal(denied.status, 403);
    const invalid = await post('greeting-stickers-refresh', { maxSets: 0 });
    assert.equal(invalid.status, 400);
    const started = await post('greeting-stickers-refresh', {});
    assert.equal(started.status, 200);
    assert.equal((await readWireResponse(started)).ok, true);
    await catalogFinished(fixture.catalog);
    const response = await post('greeting-stickers-status', { limit: 1 });
    assert.equal(response.status, 200);
    const result = await readWireResponse(response);
    assert.equal(result.cache.total, 4);
    assert.equal(result.stickers.length, 1);
    assert.equal(result.more, true);
    assert.equal(result.job.state, 'done');
    assert.equal((await post('greeting-stickers-cancel', {})).status, 200);
  }
  assert.equal(
    fixture.calls.some((call) => call.className === 'SendMedia'),
    false
  );
});
