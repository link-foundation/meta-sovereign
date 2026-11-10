import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { CHAT_USERS_POSTS } from '../src/server/routes-telegram-chat-users.js';
import { TELEGRAM_CALLS } from '../src/web/dom-telegram-calls.js';
import { greetingSendFixture } from './helpers/greeting-send-fakes.mjs';

test('reviewed greeting sends use the actual default text/binary Lino API with origin protection', async (t) => {
  const f = await greetingSendFixture();
  const server = await startServer({
    store: f.store,
    port: 0,
    enableHandlers: false,
    enableSync: false,
    automations: { scheduler: false },
    telegramAccount: {
      ...f.actions,
      status: async () => ({ connected: true, kind: 'user' }),
      stop: f.env.greetingSendStop,
    },
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  const status = await readWireResponse(
    await fetch(`${base}/api/telegram/status`)
  );
  assert.equal(status.capabilities.greetingSendPreview, true);
  for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
    const post = (name, body, headers = {}) =>
      fetch(`${base}/api/telegram/${name}`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type, ...headers },
        body: encodeWire(body, type),
      });
    const denied = await post(
      'greeting-send-apply',
      { confirm: true, planId: 'missing' },
      { origin: 'https://untrusted.invalid' }
    );
    assert.equal(denied.status, 403);
    assert.equal(
      (await post('greeting-send-preview', { chat: 'many words' })).status,
      400
    );
    assert.equal(
      (await post('greeting-send-apply', { planId: 'missing' })).status,
      400
    );
    const plan = await readWireResponse(
      await post('greeting-send-preview', {
        chat: index ? '@GreetingGroup' : '@GreetingUser',
        sticker: '11',
      })
    );
    assert.equal(plan.ok, true);
    assert.equal(f.sends().length, index);
    const result = await readWireResponse(
      await post('greeting-send-apply', { confirm: true, planId: plan.planId })
    );
    assert.equal(result.status, 'sent');
    assert.equal(result.messageId, '1');
    assert.equal(f.sends().length, index + 1);
    assert.equal((await post('greeting-send-cancel', {})).status, 200);
  }
});
test('missing account methods are unsupported and the shared browser bridge uses actual capability flags', async () => {
  for (const suffix of ['preview', 'apply', 'cancel']) {
    const name = `greeting-send-${suffix}`;
    const body =
      suffix === 'preview'
        ? { chat: '8' }
        : suffix === 'apply'
          ? { confirm: true, planId: 'x' }
          : {};
    const result = await CHAT_USERS_POSTS[name]({}, body);
    assert.equal(result[0], 501);
  }
  for (const name of [
    'telegramGreetingSendPreview',
    'telegramGreetingSendApply',
    'telegramGreetingSendCancel',
  ]) {
    assert.equal(TELEGRAM_CALLS[name].capability, 'greetingSendPreview');
  }
});
