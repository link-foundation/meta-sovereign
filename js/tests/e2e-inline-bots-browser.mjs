// Real browser e2e for inline bots in the box (R-Y138), as Telegram
// Desktop's: "@gif " shows the bot's hint, "@gif cats" a moment later its
// pictures in a grid over the box, "Load more" asks the next page, Up and
// Down move and Enter sends the picked one through the bot (the box
// emptied), Escape closes; an article bot's answers are a list with a
// "switch to the bot" button; a user that is no inline bot is silent; a
// bot's error is shown as text. Telegram's answers faked in the page,
// fake chats in a memory store; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:inline-bots

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '7';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Friend',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Friend',
  body: 'hello there',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('inline-bots', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHAT, kind: 'user', title: 'Fake Friend' })
);
// A one-pixel picture for the bot's files.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/sticker*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);

const BOTS = {
  gif: { id: '71', username: 'gif', name: 'GIF', placeholder: 'Search GIFs' },
  wiki: { id: '72', username: 'wiki', name: 'Wiki', placeholder: 'Search' },
  slow: { id: '73', username: 'slow', name: 'Slow', placeholder: 'Wait' },
};
const gifs = (from, count, queryId) =>
  Array.from({ length: count }, (_, i) => ({
    id: `g${from + i}`,
    queryId,
    type: 'gif',
    title: '',
    description: '',
    doc: { id: String(100 + from + i), kind: 'gif', format: 'mp4' },
  }));
const base_ = { ok: true, queryId: '555', switchPm: null, switchWebview: null };

const botRequests = [];
const resultRequests = [];
const sends = [];
await page.route('**/api/telegram/inline-bot', (route) => {
  const { username } = route.request().postDataJSON();
  botRequests.push(username);
  return fulfil(
    route,
    BOTS[username]
      ? { ok: true, bot: BOTS[username] }
      : { ok: false, error: 'not an inline bot', code: 'not-inline' }
  );
});
await page.route('**/api/telegram/inline-results', (route) => {
  const body = route.request().postDataJSON();
  resultRequests.push(body);
  if (body.username === 'slow') {
    return fulfil(route, {
      ok: false,
      error: 'BOT_RESPONSE_TIMEOUT',
      code: 'bot-timeout',
    });
  }
  if (body.username === 'wiki') {
    return fulfil(route, {
      ...base_,
      bot: BOTS.wiki,
      gallery: false,
      next: null,
      switchPm: { text: 'Open the bot', startParam: 'x' },
      results: [
        {
          id: 'w1',
          queryId: '555',
          type: 'article',
          title: 'Moscow',
          description: 'Capital of Russia',
          doc: null,
        },
        {
          id: 'w2',
          queryId: '555',
          type: 'article',
          title: 'Moscow, Idaho',
          description: 'A city',
          doc: null,
        },
      ],
    });
  }
  return fulfil(
    route,
    body.offset === ''
      ? {
          ...base_,
          bot: BOTS.gif,
          gallery: true,
          next: '3',
          results: gifs(0, 3, '555'),
        }
      : {
          ...base_,
          bot: BOTS.gif,
          gallery: true,
          next: null,
          queryId: '556',
          results: gifs(3, 2, '556'),
        }
  );
});
await page.route('**/api/telegram/inline-send', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});

const starts = [];
await page.route('**/api/telegram/inline-start-bot', (route) => {
  starts.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: '72' });
});

const box = page.locator('.chat-composer textarea');
const panel = page.locator('.inline-panel');
const results = page.locator('.inline-result');
const selected = () =>
  page
    .locator('.inline-result[aria-selected="true"]')
    .getAttribute('data-inline-result');

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box.waitFor({ timeout: 15000 });
  assert((await panel.count()) === 0, 'closed before typing');

  // The hint shows while nothing follows the name; nothing is asked yet.
  await box.click();
  await box.pressSequentially('@gif ');
  await panel.waitFor({ timeout: 5000 });
  assert((await panel.textContent()).includes('Search GIFs'), 'placeholder');
  await page.waitForTimeout(700);
  assert(resultRequests.length === 0, 'nothing asked for an empty query');

  // The answers come a moment after typing stops, as a grid.
  await box.pressSequentially('cats');
  await until(async () => (await results.count()) === 3, 'three results');
  assert(resultRequests.length === 1, `one request: ${resultRequests.length}`);
  assert(
    resultRequests[0].query === 'cats' &&
      resultRequests[0].username === 'gif' &&
      resultRequests[0].chat === CHAT &&
      resultRequests[0].offset === '',
    `request: ${JSON.stringify(resultRequests[0])}`
  );
  assert(
    (await page.locator('.inline-results.is-grid').count()) === 1,
    'a grid'
  );
  await until(
    async () =>
      (await page.locator('.inline-result video[poster]').count()) > 0,
    'GIFs from the app server (poster and video)'
  );

  // More are asked for with the bot's offset.
  await page.locator('[data-action="inline-more"]').click();
  await until(async () => (await results.count()) === 5, 'five results');
  assert(resultRequests[1].offset === '3', 'next offset');
  assert(
    (await page.locator('[data-action="inline-more"]').count()) === 0,
    'no more to load'
  );

  // Arrows move; Enter sends the picked one and empties the box. The
  // pointer is moved off the results first: hovering one picks it.
  await page.mouse.move(0, 0);
  assert((await selected()) === 'g0', 'first selected');
  await box.press('ArrowDown').then(() => box.press('ArrowDown'));
  assert((await selected()) === 'g2', `down: ${await selected()}`);
  await box.press('ArrowUp');
  assert((await selected()) === 'g1', 'up');
  await box.press('Enter');
  await until(() => sends.length === 1, 'the send request');
  assert(
    sends[0].chat === CHAT &&
      sends[0].queryId === '555' &&
      sends[0].id === 'g1',
    `send: ${JSON.stringify(sends[0])}`
  );
  await until(async () => (await box.inputValue()) === '', 'box emptied');
  await until(async () => (await panel.count()) === 0, 'panel closed');

  // Escape closes the results, leaving the text.
  await box.pressSequentially('@gif dogs');
  await until(async () => (await results.count()) === 3, 'results again');
  await box.press('Escape');
  await until(async () => (await panel.count()) === 0, 'closed by Escape');
  assert((await box.inputValue()) === '@gif dogs', 'text kept');
  assert(sends.length === 1, 'Escape sends nothing');
  await box.fill('');

  // Articles: a list, and the bot's own chat behind a button.
  await box.pressSequentially('@wiki moscow');
  await until(async () => (await results.count()) === 2, 'articles');
  assert(
    (await page.locator('.inline-results.is-list').count()) === 1,
    'a list'
  );
  assert((await results.first().textContent()).includes('Capital'), 'text');
  await page.locator('[data-action="inline-switch-pm"]').click();
  // "Switch to PM": the bot is started with its parameter (R-Y147).
  await until(() => starts.length === 1, 'the bot started');
  assert(
    starts[0].username === 'wiki' && starts[0].startParam === 'x',
    `start: ${JSON.stringify(starts[0])}`
  );
  await until(
    () => page.url().includes('chat=telegram:72'),
    `opens the bot's chat: ${page.url()}`
  );
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box.waitFor({ timeout: 15000 });
  await box.fill('');

  // A user or a bot without inline mode is an ordinary mention.
  await box.pressSequentially('@someone hello');
  await page.waitForTimeout(700);
  assert((await panel.count()) === 0, 'no panel for an ordinary mention');
  assert(botRequests.includes('someone'), 'it was looked up');
  await box.fill('');

  // A bot's error is shown as text.
  await box.pressSequentially('@slow hurry');
  await page.locator('.inline-status').waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.inline-status').textContent()).includes(
      'did not answer'
    ),
    'timeout text'
  );
  // Each bot looked up once.
  assert(
    botRequests.filter((n) => n === 'gif').length === 1,
    `gif looked up once: ${botRequests}`
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
