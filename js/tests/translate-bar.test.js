// The translate bar and the summary (R-Y213): the language guess, the
// store, the server module and its routes. Fake clients; nothing reaches
// a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createTranslateChat } from '../src/sources/telegram-translate-chat.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  detectLanguage,
  foreignLanguage,
} from '../src/web/translate-detect.js';
import {
  failureOfChat,
  forgetTranslateStore,
  missingIds,
  shownLanguage,
  showOriginal,
  showTranslated,
  skipLanguage,
  skippedLanguages,
  translateBatch,
  translatedItem,
} from '../src/web/translate-store.js';
import { hasSummary } from '../src/web/chat-translate.js';
import { menuItems } from '../src/web/chat-selection.js';
import { languageName } from '../src/web/chat-translate-bar.js';

test('detectLanguage: scripts and Latin stopwords', () => {
  const cases = [
    ['Привет, как у тебя дела сегодня?', 'ru'],
    ['Привіт, як справи? Це їжак', 'uk'],
    ['今天天气很好，我们去公园吧', 'zh'],
    ['今日はいい天気ですね', 'ja'],
    ['안녕하세요 반갑습니다', 'ko'],
    ['नमस्ते आप कैसे हैं', 'hi'],
    ['مرحبا كيف حالك اليوم', 'ar'],
    ['Hello, what is this and are you here with me', 'en'],
    ['Ich habe das nicht gesehen und du auch nicht', 'de'],
    ['Esto es una cosa que no es para ti', 'es'],
    ['Nous avons des amis dans la ville et vous', 'fr'],
  ];
  for (const [text, code] of cases) {
    assert.equal(detectLanguage(text), code, text);
  }
  assert.equal(detectLanguage('ok'), null);
  assert.equal(detectLanguage('https://example.com/abc'), null);
  assert.equal(detectLanguage(''), null);
});

test('foreignLanguage: mostly another language than the page, not skipped', () => {
  const ru = ['Привет, как дела сегодня?', 'Что нового у тебя?', 'ok'];
  assert.equal(foreignLanguage(ru, 'en'), 'ru');
  assert.equal(foreignLanguage(ru, 'ru'), null, 'the page language');
  assert.equal(foreignLanguage(ru, 'zh-CN', ['ru']), null, 'skipped');
  assert.equal(foreignLanguage(['Привет, как дела?'], 'en'), null, 'one text');
  const mixed = [
    'Привет, как дела сегодня?',
    'Hello, what is this and are you here',
    'This is the one that you have',
  ];
  assert.equal(foreignLanguage(mixed, 'de'), 'en', 'English is most');
  assert.equal(foreignLanguage(mixed, 'en'), null);
  assert.equal(foreignLanguage([], 'en'), null);
});

const message = (id, body = 'Привет всем') => ({
  id: `msg:telegram:7:${id}`,
  source: 'telegram',
  chat: '7',
  sender: '7',
  body,
  raw: { id },
});

test('store: translated texts kept by message and language', async () => {
  forgetTranslateStore();
  const asked = [];
  const api = {
    telegramTranslate: async (body) => {
      asked.push(body);
      return {
        ok: true,
        items: body.ids.map((id) => ({ id, text: `t${id}`, entities: [] })),
      };
    },
  };
  const messages = [message(1), message(2)];
  assert.equal(translatedItem(messages[0]), null, 'not shown yet');
  showTranslated('7', 'en');
  await translateBatch(api, '7', messages, 'en');
  assert.equal(translatedItem(messages[1]).text, 't2');
  assert.deepEqual(missingIds([...messages, message(3)], 'en'), [3]);
  await translateBatch(api, '7', messages, 'en');
  assert.equal(asked.length, 1, 'asked once');
  showOriginal('7');
  assert.equal(translatedItem(messages[0]), null, 'original again');
  assert.equal(shownLanguage('7'), null);
  showTranslated('7', 'de');
  assert.equal(translatedItem(messages[0]), null, 'another language is new');
});

test('store: batches of 20, and a refusal is kept', async () => {
  forgetTranslateStore();
  const sizes = [];
  const many = Array.from({ length: 45 }, (_, i) => message(i + 1));
  showTranslated('7', 'en');
  await translateBatch(
    {
      telegramTranslate: async (b) => {
        sizes.push(b.ids.length);
        return { ok: true, items: [] };
      },
    },
    '7',
    many,
    'en'
  );
  assert.deepEqual(sizes, [20, 20, 5]);
  forgetTranslateStore();
  showTranslated('7', 'en');
  await translateBatch(
    { telegramTranslate: async () => ({ ok: false, code: 'quota' }) },
    '7',
    many,
    'en'
  );
  assert.equal(failureOfChat('7'), 'quota');
});

test('store: skipped languages are kept per device', () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  assert.deepEqual(skippedLanguages(storage), []);
  skipLanguage('ru', storage);
  skipLanguage('ru', storage);
  skipLanguage('de', storage);
  assert.deepEqual(skippedLanguages(storage), ['ru', 'de']);
  data.set('metaSovereignTranslateSkip', '{bad');
  assert.deepEqual(skippedLanguages(storage), []);
});

test('summary: offered for long sent messages only; names', () => {
  const long = message(1, 'x'.repeat(601));
  assert.equal(hasSummary(long), true);
  assert.equal(hasSummary(message(1, 'x'.repeat(600))), false);
  const chat = { chat: '7', kind: 'private' };
  assert.ok(menuItems({ message: long, chat }).includes('summarize'));
  assert.ok(!menuItems({ message: message(1), chat }).includes('summarize'));
  assert.equal(languageName('ru'), 'Русский');
  assert.equal(languageName('zh'), '中文');
  assert.equal(languageName('xx'), 'xx');
});

class SummarizeText {
  constructor(fields) {
    Object.assign(this, fields);
  }
}

const make = ({ fail = null, premium = true } = {}) => {
  const log = [];
  const actions = createTranslateChat(
    {
      importer: async () => ({
        Api: { messages: { SummarizeText } },
        helpers: { returnBigInt: BigInt },
      }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        getMe: async () => ({ premium }),
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return {
            text: 'short',
            entities: [
              { className: 'MessageEntityBold', offset: 0n, length: 5 },
            ],
          };
        },
      }),
    }
  );
  return { ...actions, log };
};

test('summarize: the request and the answer', async () => {
  const { summarizeMessage, log } = make();
  const got = await summarizeMessage({ chat: '-100123', id: 5, to: 'ru' });
  assert.deepEqual(got, {
    ok: true,
    text: 'short',
    entities: [{ className: 'MessageEntityBold', offset: 0, length: 5 }],
  });
  assert.deepEqual(
    [log[0].peer, log[0].id, log[0].toLang],
    [{ chat: '-100123' }, 5, 'ru']
  );
  await summarizeMessage({ chat: '7', id: 6 });
  assert.equal('toLang' in log[1], false);
});

test('summarize: errors become codes; bad input asks nothing', async () => {
  for (const [name, code] of [
    ['PREMIUM_ACCOUNT_REQUIRED', 'premium'],
    ['TRANSLATE_REQ_QUOTA_EXCEEDED', 'quota'],
    ['TRANSLATIONS_DISABLED', 'disabled'],
    ['WHATEVER', 'failed'],
  ]) {
    const got = await make({ fail: name }).summarizeMessage({
      chat: '7',
      id: 1,
    });
    assert.deepEqual([got.ok, got.code], [false, code], name);
  }
  const { summarizeMessage, log } = make();
  for (const bad of [
    { chat: 'x', id: 1 },
    { chat: '7', id: 0 },
    { chat: '7', id: 1, to: 'English' },
  ]) {
    assert.equal((await summarizeMessage(bad)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('translateAccount: whether the account has Premium', async () => {
  assert.deepEqual(await make().translateAccount(), {
    ok: true,
    premium: true,
  });
  assert.equal(
    (await make({ premium: false }).translateAccount()).premium,
    false
  );
});

const post = async (route, body, account) => {
  const url = `/api/telegram/${route}`;
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: 'POST',
      url,
      headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
    }
  );
  let status = 0;
  const res = {
    setHeader: () => {},
    end: () => {},
    writeHead: (code) => {
      status = code;
    },
  };
  await handleTelegramRoutes(req, res, url, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return status;
};

test('routes: summarize validates strictly, translate-account answers', async () => {
  const account = {
    summarizeMessage: async () => ({ ok: true }),
    translateAccount: async () => ({ ok: true, premium: false }),
  };
  const good = { chat: '-100123', id: 4, to: 'de' };
  assert.equal(await post('summarize', good, account), 200);
  assert.equal(await post('summarize', { chat: '7', id: 4 }, account), 200);
  for (const bad of [
    { ...good, chat: 'abc' },
    { ...good, id: 0 },
    { ...good, id: '4' },
    { ...good, to: 'EN' },
    { ...good, to: 5 },
  ]) {
    assert.equal(
      await post('summarize', bad, account),
      400,
      JSON.stringify(bad)
    );
  }
  assert.equal(await post('translate-account', {}, account), 200);
});
