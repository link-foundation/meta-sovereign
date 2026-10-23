// Translating messages (R-Y132): the request built, the cache, the error
// codes, validation, the menu's offer and the route. Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createTranslate } from '../src/sources/telegram-translate.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { menuItems } from '../src/web/chat-selection.js';
import { startLanguage } from '../src/web/chat-translate.js';

class TranslateText {
  constructor(fields) {
    Object.assign(this, fields);
    this.className = 'TranslateText';
  }
}

const BOLD = { className: 'MessageEntityBold', length: 2 };

const make = ({ fail = null } = {}) => {
  const log = [];
  const actions = createTranslate(
    {
      importer: async () => ({
        Api: { messages: { TranslateText } },
        helpers: { returnBigInt: BigInt },
      }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return {
            result: request.id.map((id) => ({
              text: `t${id}`,
              entities: [{ ...BOLD, offset: 0n, extra: 1 }],
            })),
          };
        },
      }),
    }
  );
  return { ...actions, log };
};

test('translate: the request and the items', async () => {
  const { translateMessages, log } = make();
  const got = await translateMessages({ chat: '-5', ids: [3, 4], to: 'de' });
  assert.equal(got.ok, true);
  assert.deepEqual(got.items, [
    {
      id: 3,
      text: 't3',
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 2 }],
    },
    {
      id: 4,
      text: 't4',
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 2 }],
    },
  ]);
  assert.deepEqual(
    [log[0].peer, log[0].id, log[0].toLang],
    [{ chat: '-5' }, [3, 4], 'de']
  );
});

test('translate: answers are kept by chat, id and language', async () => {
  const { translateMessages, log } = make();
  await translateMessages({ chat: '-5', ids: [3], to: 'de' });
  await translateMessages({ chat: '-5', ids: [3], to: 'de' });
  assert.equal(log.length, 1, 'asked once');
  await translateMessages({ chat: '-5', ids: [3, 4], to: 'de' });
  assert.deepEqual(log[1].id, [4], 'only the missing id');
  await translateMessages({ chat: '-5', ids: [3], to: 'fr' });
  await translateMessages({ chat: '-6', ids: [3], to: 'de' });
  assert.equal(log.length, 4, 'another language or chat asks again');
});

test('translate: Telegram errors become codes', async () => {
  for (const [name, code] of [
    ['TRANSLATIONS_DISABLED', 'disabled'],
    ['TRANSLATE_REQ_QUOTA_EXCEEDED', 'quota'],
    ['FLOOD_WAIT_9', 'quota'],
    ['MSG_ID_INVALID', 'not-found'],
    ['TO_LANG_INVALID', 'bad-language'],
    ['PREMIUM_ACCOUNT_REQUIRED', 'premium'],
    ['SOMETHING', 'failed'],
  ]) {
    const { translateMessages } = make({ fail: name });
    const got = await translateMessages({ chat: '7', ids: [1], to: 'en' });
    assert.deepEqual([got.ok, got.code], [false, code], name);
  }
});

test('translate: bad input asks nothing', async () => {
  const { translateMessages, log } = make();
  for (const bad of [
    { chat: 'x', ids: [1], to: 'en' },
    { chat: '7', ids: [], to: 'en' },
    { chat: '7', ids: [0], to: 'en' },
    { chat: '7', ids: Array.from({ length: 21 }, (_, i) => i + 1), to: 'en' },
    { chat: '7', ids: [1], to: 'English' },
  ]) {
    assert.equal((await translateMessages(bad)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('translate: the menu offers it for text, the box starts in a language', () => {
  const msg = {
    id: 'msg:telegram:7:5',
    source: 'telegram',
    chat: '7',
    sender: '7',
    body: 'hello',
    raw: { id: 5 },
  };
  const chat = { chat: '7', kind: 'private' };
  assert.ok(menuItems({ message: msg, chat }).includes('translate'));
  const bare = menuItems({ message: { ...msg, body: '' }, chat });
  assert.ok(!bare.includes('translate'));
  assert.equal(startLanguage('ru'), 'ru');
  assert.equal(startLanguage('zh'), 'zh-CN');
  assert.equal(startLanguage('xx', { language: 'de-AT' }), 'de');
  assert.equal(startLanguage('xx', { language: 'xx' }), 'en');
});

const post = async (body, account) => {
  const url = '/api/telegram/translate';
  const headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: 'POST',
      url,
      headers,
    }
  );
  let status = 0;
  const res = { setHeader: () => {}, end: () => {} };
  res.writeHead = (code) => {
    status = code;
  };
  const options = { telegramAccount: account, allowOrigins: [] };
  await handleTelegramRoutes(req, res, url, options);
  return status;
};

test('route translate validates strictly', async () => {
  const account = { translateMessages: async () => ({ ok: true, items: [] }) };
  const good = { chat: '-100123', ids: [1, 2], to: 'pt-BR' };
  assert.equal(await post(good, account), 200);
  for (const bad of [
    { ...good, chat: 'abc' },
    { ...good, chat: 5 },
    { ...good, ids: [] },
    { ...good, ids: [0] },
    { ...good, ids: [1.5] },
    { ...good, ids: ['1'] },
    { ...good, ids: Array.from({ length: 21 }, (_, i) => i + 1) },
    { ...good, to: 'EN' },
    { ...good, to: 'en_US' },
    { ...good, to: undefined },
  ]) {
    assert.equal(await post(bad, account), 400, JSON.stringify(bad));
  }
});
