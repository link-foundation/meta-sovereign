// A bot's buttons (R-Y110): the buttons under a message and the keyboard
// under the box read from what Telegram stored, the newest bot message
// deciding the keyboard; only web links opened; a press asks Telegram
// for the bot's answer (its data in bytes), a bot slow to answer is no
// failure; the route refuses what is not a press.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  botAskOf,
  buttonOf,
  inlineKeyboardOf,
  replyKeyboardOf,
} from '../src/web/bot-keyboard.js';
import { openableUrl } from '../src/web/chat-bots.js';
import { answerOf, createBotActions } from '../src/sources/telegram-bots.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const row = (...buttons) => ({ className: 'KeyboardButtonRow', buttons });
const message = (id, replyMarkup, extra = {}) => ({
  id: `msg:telegram:42:${id}`,
  sender: '42',
  body: `message ${id}`,
  raw: { id, replyMarkup },
  ...extra,
});

test('the buttons under a message, each as a press does it', () => {
  const m = message(1, {
    className: 'ReplyInlineMarkup',
    rows: [
      row(
        {
          className: 'KeyboardButtonCallback',
          text: 'Yes',
          data: { bytes: 'eWVz' },
          style: { bgSuccess: true },
        },
        { className: 'KeyboardButtonUrl', text: 'Site', url: 'https://x.y' }
      ),
      row(
        { className: 'KeyboardButtonSwitchInline', text: 'Share', query: 'q' },
        { className: 'KeyboardButtonCopy', text: 'Code', copyText: '1234' },
        { className: 'KeyboardButtonUnknownNew', text: 'Later' }
      ),
      row({ className: 'KeyboardButtonUserProfile', text: 'Me', userId: 7 }),
      row(),
    ],
  });
  const rows = inlineKeyboardOf(m);
  assert.equal(rows.length, 3, 'an empty row is dropped');
  assert.deepEqual(rows[0][0], {
    kind: 'callback',
    text: 'Yes',
    tone: 'success',
    data: 'eWVz',
    password: false,
  });
  assert.equal(rows[0][1].url, 'https://x.y');
  assert.deepEqual(
    rows[1].map((b) => b.kind),
    ['switch', 'copy'],
    'a button not known is left out'
  );
  assert.equal(rows[1][1].copy, '1234');
  assert.equal(rows[2][0].user, '7');
  assert.equal(inlineKeyboardOf(message(2, null)), null);
  assert.equal(
    inlineKeyboardOf({ ...m, pending: true }),
    null,
    'not while it is sent'
  );
  assert.equal(
    buttonOf({ className: 'KeyboardButtonGame', text: 'Play' }).kind,
    'game'
  );
});

const keyboard = (rows, extra = {}) => ({
  className: 'ReplyKeyboardMarkup',
  rows,
  ...extra,
});
const text = (words) => ({ className: 'KeyboardButton', text: words });

test("the keyboard under the box: the newest bot message's", () => {
  const shown = message(
    1,
    keyboard([row(text('A'), text('B'))], {
      resize: true,
      singleUse: true,
      placeholder: 'Pick',
    })
  );
  const kb = replyKeyboardOf([shown, message(2, null)], { personal: true });
  assert.equal(kb.message, shown);
  assert.deepEqual(
    kb.rows[0].map((b) => b.text),
    ['A', 'B']
  );
  assert.equal(kb.resize, true);
  assert.equal(kb.singleUse, true);
  assert.equal(kb.placeholder, 'Pick');
  const hidden = message(3, { className: 'ReplyKeyboardHide' });
  assert.equal(replyKeyboardOf([shown, hidden], { personal: true }), null);
  // Ours do not change it.
  const ours = message(4, { className: 'ReplyKeyboardHide' }, { sender: 'me' });
  assert.ok(replyKeyboardOf([shown, ours], { personal: true }));
});

test('a keyboard for some only shows in a group for who it answers', () => {
  const selective = message(
    5,
    keyboard([row(text('A'))], { selective: true }),
    { replyTo: '42:9' }
  );
  assert.equal(replyKeyboardOf([selective], { personal: false }), null);
  assert.ok(
    replyKeyboardOf([selective], {
      personal: false,
      mine: (ref) => ref === '42:9',
    })
  );
  assert.ok(replyKeyboardOf([selective], { personal: true }));
});

test('a bot asking for an answer: the message to answer and its words', () => {
  const force = message(6, {
    className: 'ReplyKeyboardForceReply',
    placeholder: 'Your name',
  });
  assert.deepEqual(botAskOf([force], { personal: true }), {
    placeholder: 'Your name',
    reply: force,
  });
  assert.deepEqual(botAskOf([], {}), { placeholder: null, reply: null });
});

test('only web links open; a Telegram link as its t.me page', () => {
  assert.equal(openableUrl('https://example.org/a'), 'https://example.org/a');
  assert.equal(openableUrl(' http://x.y '), 'http://x.y');
  assert.equal(openableUrl('javascript:alert(1)'), null);
  assert.equal(openableUrl('file:///etc/passwd'), null);
  assert.equal(openableUrl('tg://resolve?domain=durov'), 'https://t.me/durov');
  assert.equal(openableUrl(null), null);
});

const fakeEnv = (invoke) => {
  class GetBotCallbackAnswer {
    constructor(args) {
      Object.assign(this, args);
    }
  }
  return {
    importer: async () => ({ Api: { messages: { GetBotCallbackAnswer } } }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
    client: { invoke },
  };
};

test("a press asks Telegram for the bot's answer", async () => {
  const asked = [];
  const env = fakeEnv(async (request) => {
    asked.push(request);
    return { message: 'Done', alert: true, cacheTime: 0 };
  });
  const bots = createBotActions(env, { userClient: async () => env.client });
  const answer = await bots.botCallback({ chat: '42', id: 7, data: 'eWVz' });
  assert.deepEqual(answer, {
    ok: true,
    message: 'Done',
    alert: true,
    url: null,
  });
  assert.equal(asked[0].msgId, 7);
  assert.equal(Buffer.from(asked[0].data).toString(), 'yes');
  assert.deepEqual(asked[0].peer, { peer: '42' });
  await bots.botCallback({ chat: '42', id: 8, game: true });
  assert.equal(asked[1].game, true);
  assert.equal(asked[1].data, undefined);
});

const refusing = (reason) => {
  const env = fakeEnv(async () => {
    throw Object.assign(new Error(reason), { errorMessage: reason });
  });
  return createBotActions(env, { userClient: async () => env.client });
};

test('a bot slow to answer is no failure; a refusal is named', async () => {
  const press = { chat: '1', id: 2, data: 'AA==' };
  assert.deepEqual(await refusing('BOT_RESPONSE_TIMEOUT').botCallback(press), {
    ok: true,
    message: null,
    alert: false,
    url: null,
  });
  assert.deepEqual(await refusing('MESSAGE_ID_INVALID').botCallback(press), {
    ok: false,
    code: 'message-gone',
  });
  await assert.rejects(refusing('FLOOD_WAIT_5').botCallback(press));
  const none = createBotActions(fakeEnv(), { userClient: async () => null });
  assert.equal((await none.botCallback(press)).supported, false);
  assert.equal(answerOf({ url: 'https://g.me' }).url, 'https://g.me');
});

const post = async (account, route, body) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(words) {
      this.body = words;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the route takes a press, refuses what is not one', async () => {
  const calls = [];
  const account = {
    botCallback: async (args) => {
      calls.push(args);
      return { ok: true, message: null, alert: false, url: null };
    },
  };
  const good = await post(account, 'bot-callback', {
    chat: '42',
    id: 7,
    data: 'eWVz',
  });
  assert.equal(good.status, 200);
  assert.deepEqual(calls[0], { chat: '42', id: 7, data: 'eWVz', game: false });
  assert.equal(
    (await post(account, 'bot-callback', { chat: '42', id: 7, game: true }))
      .status,
    200
  );
  for (const bad of [
    { id: 7, data: 'eWVz' },
    { chat: '42', id: 0, data: 'eWVz' },
    { chat: '42', id: 7 },
    { chat: '42', id: 7, data: 'not base64!' },
    { chat: '42', id: 7, data: 'A'.repeat(120) },
  ]) {
    assert.equal((await post(account, 'bot-callback', bad)).status, 400);
  }
  assert.equal(calls.length, 2);
});
