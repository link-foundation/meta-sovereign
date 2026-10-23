// Real browser e2e for the bot and mini-app extras (R-Y194), as Telegram
// Desktop has them: the chat list's search lists the popular mini apps
// (avatar, name, monthly users) a page at a time, narrows them to what is
// typed, a click opens the bot's chat and "Open" asks for its main mini
// app; a bot's info column lists similar bots that open on a click; a mini
// app's prepared message opens a "Share message" chooser with a preview
// and only the chats of the allowed kinds, sending (through the inline
// send) on the click of one chat, and telling the app how it ended; a
// collectible username or number opens Fragment's card (date, price in
// money and crypto, a "Learn more" link for http(s) only, in a new tab).
// Telegram's answers are faked in the page, chats live in a memory store,
// the app is a fake page of another (https) origin answered inside the
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:apps

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOT = '44';
const FRIEND = '45';
const MENU = '8';
const GROUP = '-1005';
const CHANNEL = '-1008';
const ORIGIN = 'https://miniapp.test';
const CHATS = [
  [ANN, 'Ann Lee', 'private'],
  [BOT, 'Helper Bot', 'private'],
  [FRIEND, 'Rare Name', 'private'],
  [MENU, 'Fake App Bot', 'private'],
  [GROUP, 'Fake Group', 'supergroup'],
  [CHANNEL, 'News Channel', 'channel'],
];
const INFO = {
  [ANN]: { kind: 'user', title: 'Ann Lee' },
  [BOT]: { kind: 'user', title: 'Helper Bot', bot: true },
  [MENU]: { kind: 'user', title: 'Fake App Bot', bot: true },
  [FRIEND]: {
    kind: 'user',
    title: 'Rare Name',
    username: 'rare_name',
    collectible: { usernames: ['rare_name'], phone: '+88800000000' },
  },
  [GROUP]: { kind: 'channel', title: 'Fake Group' },
  [CHANNEL]: { kind: 'channel', title: 'News Channel', broadcast: true },
};
const store = createMemoryStore();
for (const [chat, name, type] of CHATS) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

// The fake app: another origin, answered by the browser itself. When the
// page says `ask` it asks to share the message the page names.
const APP = `<!doctype html><meta charset="utf-8"><title>fake app</title>
<p>hello from the app</p>
<script>
window.got = [];
const send = (t, d) =>
  parent.postMessage(JSON.stringify({ eventType: t, eventData: d }), '*');
addEventListener('message', (e) => {
  let m = {};
  try { m = JSON.parse(e.data); } catch {}
  window.got.push(m);
  if (m.eventType === 'ask') {
    send('web_app_send_prepared_message', m.eventData);
  }
});
send('iframe_ready', { reload_supported: true });
send('web_app_ready');
</script>`;

const { base, page, until, finish } = await openChatApp('apps', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...(INFO[chat] ?? {}) });
});
await page.route('**/api/telegram/bot-commands', (route) =>
  fulfil(route, {
    ok: true,
    commands: [],
    menu:
      String(route.request().postDataJSON()?.chat) === MENU
        ? { kind: 'webapp', text: 'Open app', url: `${ORIGIN}/menu` }
        : { kind: 'default' },
  })
);

const calls = {};
const record = async (name, answer) => {
  calls[name] = [];
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    calls[name].push(body);
    return fulfil(route, answer(body));
  });
};
const app = (chat, name, users, mainApp = false, username = null) => ({
  chat,
  name,
  username: username ?? `bot_${chat}`,
  users,
  mainApp,
});
await record('apps-popular', (body) =>
  body.offset === 'n2'
    ? { ok: true, apps: [app('779', 'Weather Now', null)], next: null }
    : {
        ok: true,
        apps: [
          app('777', 'Pizza Shop', 1200, true, 'pizza_bot'),
          app('778', 'Todo List', 5),
        ],
        next: 'n2',
      }
);
await record('bot-similar', () => ({
  ok: true,
  bots: [app('51', 'Sibling One', 90), app('52', 'Sibling Two', null)],
}));
await record('web-app-open', (body) =>
  body.kind === 'menu'
    ? { ok: true, url: `${ORIGIN}/menu#tgWebAppData=fake`, queryId: null }
    : { ok: false, code: 'no-app' }
);
await record('web-app-prolong', () => ({ ok: true }));
await record('prepared-message', () => ({
  ok: true,
  queryId: '55',
  id: 'r1',
  preview: {
    type: 'article',
    title: 'Join my game',
    description: 'Tap to play',
  },
  peerTypes: ['users', 'groups'],
  bot: MENU,
}));
await record('inline-send', () => ({ ok: true }));
await record('collectible-info', (body) => ({
  ok: true,
  date: 1_700_000_000,
  price: { amount: '1250', currency: 'USD' },
  crypto: { amount: '5500000000', currency: 'TON' },
  url:
    body.kind === 'phone'
      ? 'javascript:alert(1)'
      : 'https://fragment.com/username/rare_name',
}));
// The app's own origin: a page that is not this app's, no network.
await page.route(`${ORIGIN}/**`, (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: APP })
);

const search = page.locator('input.chat-search');
const section = page.locator('[data-apps]');
const rows = page.locator('[data-apps] [data-app]');
const openChat = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};
const openAbout = async (chat) => {
  await openChat(chat);
  const about = page.locator('.person-panel');
  if ((await about.count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await about.waitFor({ timeout: 10000 });
  await until(
    async () => (await page.locator('.person-panel-body').count()) > 0,
    'the panel'
  );
};

const appsList = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${ANN}"]`).waitFor();
  assert((await section.count()) === 0, 'no apps before the search is used');
  assert(calls['apps-popular'].length === 0, 'nothing asked before');

  // Focusing the box lists the first page: name, monthly users.
  await search.click();
  await until(async () => (await rows.count()) === 2, 'the first page');
  const first = await section.textContent();
  assert(first.includes('Pizza Shop'), `name: ${first}`);
  assert(first.includes('1,200 monthly users'), `users: ${first}`);
  assert(first.includes('Apps'), 'titled');
  assert(
    (await page.locator('[data-app="778"] [data-app-users]').textContent()) ===
      '5 monthly users',
    'the plural'
  );
  assert(calls['apps-popular'][0].offset === undefined, 'first page offset');

  // The next page is asked by the offset Telegram gave.
  await page.locator('[data-action="apps-more"]').click();
  await until(async () => (await rows.count()) === 3, 'the second page');
  assert(calls['apps-popular'][1].offset === 'n2', 'paged by the offset');
  assert(
    (await page.locator('[data-action="apps-more"]').count()) === 0,
    'no more after the last page'
  );
  assert(
    (await page.locator('[data-app="779"] [data-app-users]').count()) === 0,
    'no users line when Telegram gave none'
  );

  // Typing narrows the list.
  await search.fill('pizza');
  await until(async () => (await rows.count()) === 1, 'narrowed');
  assert(
    (await rows.first().getAttribute('data-app')) === '777',
    'the pizza app'
  );
  await search.fill('');

  // A click opens the bot's chat; no main app is asked for.
  await rows.nth(1).locator('[data-action="app-chat"]').click();
  await until(
    async () => (await page.locator('[data-chat="telegram:778"]').count()) > 0,
    'the bot chat opens'
  );
  assert(calls['web-app-open'].length === 0, 'no mini app on a plain click');
  // The box lets go once the chat is open: the list is gone.
  await until(async () => (await section.count()) === 0, 'the list closes');

  // "Open" asks for the main mini app of that bot.
  await search.click();
  await until(async () => (await rows.count()) === 3, 'the list again');
  assert(
    (await page
      .locator('[data-app="778"] [data-action="app-launch"]')
      .count()) === 0,
    'no Open without a main app'
  );
  await page.locator('[data-app="777"] [data-action="app-launch"]').click();
  await until(
    async () => calls['web-app-open'].some((b) => b.kind === 'main'),
    'the main app asked for'
  );
  const main = calls['web-app-open'].find((b) => b.kind === 'main');
  assert(
    main.username === 'pizza_bot' && main.chat === '777',
    `main request: ${JSON.stringify(main)}`
  );
};

const similarBots = async () => {
  await page.goto(`${base}/`);
  await openAbout(BOT);
  const cards = page.locator('.person-panel [data-similar-bot]');
  await until(async () => (await cards.count()) === 2, 'two similar bots');
  const text = await page
    .locator('.person-panel .similar-channels')
    .textContent();
  assert(text.includes('Similar bots'), `title: ${text}`);
  assert(
    text.includes('Sibling One') && text.includes('90 monthly users'),
    text
  );
  assert(calls['bot-similar'][0].chat === BOT, 'asked for this bot');
  await page.locator('[data-similar-bot="52"]').click();
  await until(
    async () => (await page.locator('[data-chat="telegram:52"]').count()) > 0,
    'a similar bot opens'
  );
  // A person has none.
  const asked = calls['bot-similar'].length;
  await openAbout(ANN);
  await page.waitForTimeout(400);
  assert((await cards.count()) === 0, 'no similar bots for a person');
  assert(calls['bot-similar'].length === asked, 'not asked for a person');
};

const appFrame = () => page.frames().find((f) => f.url().startsWith(ORIGIN));
const gotType = async (type) =>
  (
    (await appFrame()
      ?.evaluate(() => window.got)
      .catch(() => [])) ?? []
  ).filter((m) => m.eventType === type);
const ask = (id) =>
  page.evaluate((id) => {
    document
      .querySelector('iframe[data-web-app-frame]')
      .contentWindow.postMessage(
        JSON.stringify({ eventType: 'ask', eventData: { id } }),
        '*'
      );
  }, id);

const sharing = async () => {
  await page.goto(`${base}/`);
  await openChat(MENU);
  await page.locator('[data-web-app-menu]').click();
  await page.locator('[data-web-app]').waitFor({ timeout: 5000 });
  await page.locator('iframe[data-web-app-frame]').waitFor({ timeout: 5000 });
  await until(
    async () => (await page.locator('.web-app-loading').count()) === 0,
    'the app is ready'
  );

  // The app asks; Telegram is asked for that message; the chooser shows it.
  await ask('prep1');
  const dialog = page.locator('[data-dialog="prepared-share"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-prepared-preview]').waitFor({ timeout: 5000 });
  assert(calls['prepared-message'].length === 1, 'asked for the message');
  assert(
    calls['prepared-message'][0].id === 'prep1' &&
      calls['prepared-message'][0].bot === MENU,
    `ask: ${JSON.stringify(calls['prepared-message'][0])}`
  );
  const preview = await dialog.locator('[data-prepared-preview]').textContent();
  assert(
    preview.includes('Join my game') &&
      preview.includes('Tap to play') &&
      preview.includes('people, groups'),
    `preview: ${preview}`
  );
  assert(calls['inline-send'].length === 0, 'nothing sent before a click');

  // Only chats of the allowed kinds: people and groups, not the channel.
  const pick = (chat) => dialog.locator(`[data-share-chat="telegram:${chat}"]`);
  await pick(ANN).waitFor({ timeout: 5000 });
  assert((await pick(GROUP).count()) === 1, 'a group is allowed');
  assert((await pick(CHANNEL).count()) === 0, 'a channel is not allowed');
  await dialog.locator('input.prepared-filter').fill('fake g');
  await until(async () => (await pick(ANN).count()) === 0, 'filtered');
  assert((await pick(GROUP).count()) === 1, 'the filter keeps the match');
  await dialog.locator('input.prepared-filter').fill('');

  // Closing sends nothing and tells the app it was declined.
  await dialog.locator('[data-action="close"]').click();
  await until(async () => (await dialog.count()) === 0, 'closed');
  await until(
    async () => (await gotType('prepared_message_failed')).length === 1,
    'the app is told'
  );
  assert(
    (await gotType('prepared_message_failed'))[0].eventData.error ===
      'USER_DECLINED',
    'declined'
  );
  assert(calls['inline-send'].length === 0, 'nothing sent by closing');
  assert((await page.locator('[data-web-app]').count()) === 1, 'app stays');

  // A click on a chat sends it there, once, through the inline send.
  await ask('prep1');
  await dialog.waitFor({ timeout: 5000 });
  await pick(ANN).click();
  await until(async () => calls['inline-send'].length === 1, 'the send');
  assert(
    JSON.stringify(calls['inline-send'][0]) ===
      JSON.stringify({ chat: ANN, queryId: '55', id: 'r1' }),
    `send: ${JSON.stringify(calls['inline-send'][0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after send');
  await until(
    async () => (await gotType('prepared_message_sent')).length === 1,
    'the app hears it was sent'
  );
};

const collectible = async () => {
  await page.goto(`${base}/`);
  await openAbout(FRIEND);
  const name = page.locator(
    '.person-panel [data-collectible="username:rare_name"]'
  );
  await name.waitFor({ timeout: 10000 });
  assert((await name.textContent()) === '@rare_name', 'the username shown');
  assert(
    (await page.locator('.person-panel a.profile-username').count()) === 0,
    'a collectible username is not a plain link'
  );
  assert(calls['collectible-info'].length === 0, 'asked only on a click');
  await name.click();
  const card = page.locator('[data-dialog="collectible"]');
  await card.locator('[data-collectible-field="price"]').waitFor({
    timeout: 5000,
  });
  assert(
    JSON.stringify(calls['collectible-info'][0]) ===
      JSON.stringify({ kind: 'username', value: 'rare_name' }),
    `asked: ${JSON.stringify(calls['collectible-info'][0])}`
  );
  const field = async (key) =>
    card.locator(`[data-collectible-field="${key}"]`).textContent();
  assert(
    (await field('price')).includes('$12.50'),
    `price: ${await field('price')}`
  );
  assert((await field('crypto')).includes('5.5 TON'), 'crypto');
  assert(
    (await field('date')).includes('2023'),
    `date: ${await field('date')}`
  );
  const learn = card.locator('[data-collectible-learn]');
  assert(
    (await learn.getAttribute('href')) ===
      'https://fragment.com/username/rare_name',
    'the learn more address'
  );
  assert((await learn.getAttribute('target')) === '_blank', 'a new tab');
  assert((await learn.getAttribute('rel')).includes('noopener'), 'noopener');
  await card.locator('[data-action="close"]').click();
  await until(async () => (await card.count()) === 0, 'card closed');

  // The number: an address that is not http(s) gives no link.
  await page.locator('[data-collectible="phone:+88800000000"]').click();
  await card.locator('[data-collectible-field="price"]').waitFor({
    timeout: 5000,
  });
  assert(calls['collectible-info'][1].kind === 'phone', 'the number asked');
  assert((await learn.count()) === 0, 'no link for a javascript: address');
};

await finish(async () => {
  await appsList();
  await similarBots();
  await sharing();
  await collectible();
});
