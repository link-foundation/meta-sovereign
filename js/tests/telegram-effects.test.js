// Message effects (R-Y149): the source module with a fake client, the
// route validation, the store mapping and the sending path. Nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEffects } from '../src/sources/telegram-effects.js';
import { rawMessage } from '../src/sources/telegram-history.js';
import { sendText } from '../src/sources/telegram-send.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import { emojiOf, autoplays } from '../src/web/chat-effects.js';
import { validEffect } from '../src/server/routes-telegram-effects.js';
import { postRoute } from './helpers/post-route.js';

class GetAvailableEffects {
  constructor(fields) {
    Object.assign(this, fields);
    this.className = 'messages.GetAvailableEffects';
  }
}

const make = ({ fail = null, premium = false } = {}) => {
  const log = [];
  let clock = 1000;
  const env = {
    now: () => clock,
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({
      Api: { messages: { GetAvailableEffects } },
      helpers: { returnBigInt: BigInt },
    }),
  };
  const actions = createEffects(env, {
    userClient: async () => ({
      invoke: async (request) => {
        log.push(request);
        if (fail) {
          throw Object.assign(new Error(fail), { errorMessage: fail });
        }
        return {
          effects: [
            { id: 11n, emoticon: '🔥' },
            { id: 12n, emoticon: '💎', premiumRequired: true },
            { id: 13n },
          ],
        };
      },
      getMe: async () => ({ premium }),
    }),
  });
  return { ...actions, log, tick: (ms) => (clock += ms) };
};

test('effects: the list as plain ids and emoji, kept for a while', async () => {
  const { availableEffects, log, tick } = make({ premium: true });
  const got = await availableEffects();
  assert.deepEqual(got, {
    ok: true,
    effects: [
      { id: '11', emoticon: '🔥' },
      { id: '12', emoticon: '💎', premiumRequired: true },
    ],
    premium: true,
  });
  assert.equal(log[0].hash, 0);
  await availableEffects();
  assert.equal(log.length, 1, 'kept');
  tick(11 * 60_000);
  await availableEffects();
  assert.equal(log.length, 2, 'asked again later');
});

test('effects: a failure becomes a code', async () => {
  const { availableEffects } = make({ fail: 'FLOOD_WAIT_3' });
  const got = await availableEffects();
  assert.deepEqual([got.ok, got.code], [false, 'flood']);
});

test('effect ids are decimal strings', () => {
  assert.equal(validEffect(undefined), true);
  assert.equal(validEffect('5123456789012345678'), true);
  for (const bad of ['', 'x', '-1', '1.5', 5, null, '1'.repeat(21)]) {
    assert.equal(validEffect(bad), false, String(bad));
  }
});

test('route effects asks the account', async () => {
  assert.equal(
    await postRoute('effects', {}, { availableEffects: async () => ({}) }),
    200
  );
  assert.equal(await postRoute('effects', {}, {}), 400);
});

test('the store keeps effect (as a string) and the page reads it', () => {
  const raw = rawMessage({
    id: 3,
    message: 'hi',
    effect: 5104841245755180586n,
  });
  assert.equal(raw.effect, '5104841245755180586');
  const parts = parseMessageParts({
    id: 'msg:telegram:1:3',
    source: 'telegram',
    chat: '1',
    body: 'hi',
    raw,
  });
  assert.equal(parts.effect, '5104841245755180586');
  assert.equal(parseMessageParts({ body: 'x', raw: {} }).effect, null);
});

test('the badge finds its emoji and bursts only for new messages of theirs', () => {
  const list = { effects: [{ id: '11', emoticon: '🔥' }] };
  assert.equal(emojiOf(list, '11'), '🔥');
  assert.equal(emojiOf(list, '99'), null);
  assert.equal(emojiOf(null, '11'), null);
  const now = Date.now();
  const fresh = { id: 'a', timestamp: new Date(now - 1000).toISOString() };
  assert.equal(autoplays(fresh, now), true);
  assert.equal(autoplays({ ...fresh, mine: true }, now), false);
  assert.equal(autoplays({ ...fresh, pending: true }, now), false);
  const old = { id: 'b', timestamp: new Date(now - 3_600_000).toISOString() };
  assert.equal(autoplays(old, now), false);
});

test('a message goes out with its effect, the first part only', async () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return { className: 'UpdateShortSentMessage', id: 5, date: 1 };
    },
    getInputEntity: async (peer) => peer,
  };
  const named = (className) =>
    class {
      constructor(fields) {
        Object.assign(this, fields);
        this.className = className;
      }
    };
  const Api = { messages: { SendMessage: named('messages.SendMessage') } };
  await sendText({
    client,
    Api,
    helpers: { returnBigInt: BigInt, readBigIntFromBuffer: () => 1n },
    peer: 'p',
    text: 'a'.repeat(30),
    maxLength: 10,
    effect: '77',
  });
  assert.equal(log.length, 3);
  assert.equal(log[0].effect, 77n);
  assert.equal(log[1].effect, undefined);
  await sendText({ client, Api, peer: 'p', text: 'plain' });
  assert.equal('effect' in log[3], false);
});
