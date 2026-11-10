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
import { groupGreetingFixture } from './helpers/group-greeting-fakes.mjs';
import { usersFinished } from './helpers/chat-users-fakes.mjs';

test('group routes protect origins, validate confirmation and use real text/binary Lino with actual capabilities', async (t) => {
  const f = await groupGreetingFixture();
  const handle = await startServer({
    store: f.store,
    port: 0,
    enableHandlers: false,
    enableSync: false,
    automations: { scheduler: false },
    telegramAccount: {
      ...f.account,
      status: async () => ({ connected: true, kind: 'user' }),
      stop: f.env.chatUsersStop,
    },
  });
  t.after(() => handle.close());
  const base = `http://127.0.0.1:${handle.port}/api/telegram/`;
  const status = await readWireResponse(await fetch(`${base}status`));
  assert.equal(status.capabilities.chatUsersGreetingsStart, true);
  for (const [i, type] of [LINO_TEXT, LINO_BINARY].entries()) {
    const post = (name, body, headers = {}) =>
      fetch(`${base}chat-users-greetings-${name}`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type, ...headers },
        body: encodeWire(body, type),
      });
    assert.equal(
      (
        await post(
          'apply',
          { confirm: true, planId: 'x' },
          { origin: 'https://untrusted.invalid' }
        )
      ).status,
      403
    );
    assert.equal((await post('start', { chat: 'two words' })).status, 400);
    assert.equal((await post('apply', { planId: 'x' })).status, 400);
    assert.equal(
      (await post('preview', { jobId: 'x', limit: -1 })).status,
      400
    );
    const started = await readWireResponse(
      await post('start', { chat: '-44' })
    );
    assert.equal(started.ok, true);
    await usersFinished(f.account);
    const plan = await readWireResponse(
      await post('preview', { jobId: started.job.id, limit: 1, sticker: '11' })
    );
    assert.equal(plan.selected, 1);
    assert.equal(f.sends().length, i);
    const applied = await readWireResponse(
      await post('apply', { planId: plan.planId, confirm: true })
    );
    assert.equal(applied.ok, true);
    const result = await usersFinished(f.account);
    assert.equal(result.results[0].status, 'sent');
    assert.equal(f.sends().length, i + 1);
  }
});
test('group routes report unsupported methods and share capability gating in the browser bridge', async () => {
  for (const [suffix, body] of [
    ['start', { chat: '-44' }],
    ['preview', { jobId: 'x' }],
    ['apply', { planId: 'x', confirm: true }],
  ]) {
    assert.equal(
      (await CHAT_USERS_POSTS[`chat-users-greetings-${suffix}`]({}, body))[0],
      501
    );
    const method = `telegramChatUsersGreetings${suffix[0].toUpperCase()}${suffix.slice(1)}`;
    assert.equal(TELEGRAM_CALLS[method].capability, 'chatUsersGreetingsStart');
  }
});
