// Real browser e2e for ephemeral messages (layer 232, R-Y223), as Telegram's
// apps show them: a bot's message for this user only is drawn inline among
// the chat's messages by date with the ordinary bubble (text, inline
// keyboard) and the mark "Only you can see this message"; a new one pushed
// by the server appears at once, a deleted one goes; a button's press asks
// the bot only when clicked; a message replying to an ephemeral one quotes
// it when it is known, else shows a neutral "Ephemeral message" line. The
// server's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:ephemeral

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '801';
const BOT = '802';
const start = Date.now() - 60 * 60_000;
const at = (n) => new Date(start + n * 60_000).toISOString();
const base64 = (text) => Buffer.from(text).toString('base64');

const message = (n, fields = {}) => {
  const { raw = {}, ...rest } = fields;
  return {
    id: `msg:telegram:${GROUP}:${n}`,
    source: 'telegram',
    chat: GROUP,
    chatName: 'Fake Group',
    chatType: 'group',
    sender: '31',
    senderName: 'Ann',
    timestamp: at(n * 10),
    body: `message ${n}`,
    ...rest,
    raw: { id: n, ...raw },
  };
};
const ephemeral = (id, minutes, body, fields = {}) => ({
  id: `eph:telegram:${GROUP}:${id}`,
  tokens: ['ephemeral', 'telegram', GROUP, String(id)],
  children: [],
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  ephemeral: true,
  sender: BOT,
  senderName: 'Welcome Bot',
  timestamp: at(minutes),
  body,
  ...fields,
  raw: { id, message: body, ...fields.raw },
});
const press = {
  className: 'ReplyInlineMarkup',
  rows: [
    {
      className: 'KeyboardButtonRow',
      buttons: [
        {
          className: 'KeyboardButtonCallback',
          text: 'Accept rules',
          data: { bytes: base64('rules') },
        },
      ],
    },
  ],
};

const welcome = ephemeral(5, 15, 'Welcome, read the rules', {
  raw: { replyMarkup: press, entities: [] },
});
const store = createMemoryStore();
await store.put(message(1));
await store.put(message(2));
await store.put(
  message(3, {
    body: 'thanks bot',
    replyTo: `${GROUP}:5`,
    raw: { replyTo: { replyToMsgId: 5, replyToEphemeral: true } },
  })
);
await store.put(
  message(4, {
    body: 'what was that?',
    replyTo: `${GROUP}:99`,
    raw: { replyTo: { replyToMsgId: 99, replyToEphemeral: true } },
  })
);

const { base, page, until, finish } = await openChatApp('ephemeral', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'group', title: 'Fake Group' })
);
let listed = 0;
await page.route(
  (url) => url.pathname === '/api/telegram/ephemeral',
  (route) => {
    listed += 1;
    fulfil(route, { ok: true, messages: [welcome] });
  }
);
const pressed = [];
await page.route('**/api/telegram/ephemeral-callback', (route) => {
  pressed.push(route.request().postDataJSON());
  fulfil(route, { ok: true, message: 'Rules accepted', alert: false });
});
let normalPressed = 0;
await page.route('**/api/telegram/bot-callback', (route) => {
  normalPressed += 1;
  fulfil(route, { ok: true });
});

const row = (id) => page.locator(`.chat-scroll [data-message="${id}"]`);
const EPH = (id) => `eph:telegram:${GROUP}:${id}`;
const MSG = (id) => `msg:telegram:${GROUP}:${id}`;

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();

  // The ephemeral message is drawn with its mark and its button.
  await row(EPH(5)).waitFor({ timeout: 15_000 });
  assert(listed >= 1, 'the chat asked for its ephemeral messages');
  assert(
    (await row(EPH(5)).textContent()).includes('Welcome, read the rules'),
    'its text'
  );
  assert(
    (await row(EPH(5)).locator('[data-ephemeral]').textContent()).includes(
      'Only you can see this message'
    ),
    'the mark'
  );
  assert(
    (await row(EPH(5)).locator('[data-seen-id]').count()) === 0,
    'it is not marked read by its own id'
  );

  // By date: after message 1 (10 min), before message 2 (20 min).
  const order = await page
    .locator('.chat-scroll [data-message]')
    .evaluateAll((list) => list.map((n) => n.dataset.message));
  const at1 = order.indexOf(MSG(1));
  const atEph = order.indexOf(EPH(5));
  const at2 = order.indexOf(MSG(2));
  assert(at1 < atEph && atEph < at2, `in date order: ${order}`);

  // The press asks the bot only when clicked, through its own method.
  assert(pressed.length === 0, 'nothing is asked before a click');
  await page
    .locator(`[data-bot-keyboard="${EPH(5)}"] [data-bot-button="callback"]`)
    .click();
  await until(async () => pressed.length === 1, 'the press');
  assert(
    pressed[0].chat === GROUP &&
      pressed[0].id === 5 &&
      pressed[0].data === base64('rules'),
    `the press: ${JSON.stringify(pressed[0])}`
  );
  assert(normalPressed === 0, 'the normal callback was not used');
  await until(
    async () =>
      (await page.locator('.chat-notice.bot').count()) > 0 &&
      (await page.locator('.chat-notice.bot').textContent()).includes(
        'Rules accepted'
      ),
    "the bot's words"
  );

  // A reply to the known ephemeral message quotes it; to an unknown one
  // shows a neutral line.
  const quoteOf = (id) => row(id).locator('.bubble-reply');
  await until(
    async () => (await quoteOf(MSG(3)).textContent()).includes('Welcome'),
    'the quote of the known ephemeral message'
  );
  assert(
    (await quoteOf(MSG(4)).textContent()).includes('Ephemeral message'),
    'the neutral line for an unknown one'
  );

  // A new one pushed by the server shows at once…
  await store.put(ephemeral(6, 25, 'Only for you: pinned tips'));
  await row(EPH(6)).waitFor({ timeout: 10_000 });
  // …and a deleted one goes.
  await store.put({ ...welcome, deleted: true });
  await until(
    async () => (await row(EPH(5)).count()) === 0,
    'the deleted one is gone'
  );
  await until(
    async () =>
      (await quoteOf(MSG(3)).textContent()).includes('Ephemeral message'),
    'its reply no longer quotes it'
  );
});
