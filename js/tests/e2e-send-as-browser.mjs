// Real browser e2e for "Send as" (R-Y141), as Telegram Desktop has it: in
// a supergroup where Telegram offers more than one identity a round
// avatar button sits left of the box; a click lists the identities (the
// personal account, a channel with its subscribers, a Premium-only one
// locked), a pick is saved (messages.saveDefaultSendAs) and the button
// follows; what is sent from the box then carries `sendAs`. A basic group
// has no button and asks nothing. Telegram's answers faked in the page,
// fake chats in a memory store, a fake sender that records, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:send-as

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const SUPER = '-1001234';
const BASIC = '-5';
const CHANNEL = '-1005555';
const LOCKED = '-1006666';
const store = createMemoryStore();
// The basic group is the newest, so it is the chat open at first.
for (const [chat, name, type, ago] of [
  [SUPER, 'Fake Supergroup', 'supergroup', 120_000],
  [BASIC, 'Fake Basic Group', 'group', 60_000],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: '31',
    senderName: 'Ann Lee',
    body: 'hello there',
    timestamp: new Date(Date.now() - ago).toISOString(),
    raw: { id: 1 },
  });
}

const sent = [];
const { base, page, until, finish } = await openChatApp('send-as', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(route, { chat, kind: 'group', title: 'Fake Group' });
});
const asked = [];
const saved = [];
await page.route('**/api/telegram/send-as', (route) => {
  asked.push(route.request().postDataJSON().chat);
  return fulfil(route, {
    ok: true,
    current: '42',
    premium: false,
    peers: [
      { id: '42', kind: 'user', name: 'Ann Lee' },
      { id: CHANNEL, kind: 'channel', name: 'News', count: 1200 },
      { id: LOCKED, kind: 'channel', name: 'Vault', premium: true },
    ],
  });
});
await page.route('**/api/telegram/send-as-save', (route) => {
  const body = route.request().postDataJSON();
  saved.push(body);
  return body.sendAs === LOCKED
    ? fulfil(route, { ok: false, code: 'premium' })
    : fulfil(route, { ok: true, current: body.sendAs });
});

// An inline bot and a location share, to see `sendAs` on them too (R-Y147).
const inlineSends = [];
const locations = [];
await page.route('**/api/telegram/inline-bot', (route) =>
  fulfil(route, {
    ok: true,
    bot: { id: '72', username: 'wiki', name: 'Wiki', placeholder: 'Search' },
  })
);
await page.route('**/api/telegram/inline-results', (route) =>
  fulfil(route, {
    ok: true,
    bot: { id: '72', username: 'wiki', name: 'Wiki', placeholder: 'Search' },
    queryId: '555',
    gallery: false,
    next: null,
    switchPm: null,
    switchWebview: null,
    results: [
      {
        id: 'w1',
        queryId: '555',
        type: 'article',
        title: 'Moscow',
        description: 'A city',
        doc: null,
      },
    ],
  })
);
await page.route('**/api/telegram/inline-send', (route) => {
  inlineSends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: SUPER });
});
await page.route('**/api/telegram/send-location', (route) => {
  locations.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: SUPER });
});

const box = page.locator('.chat-composer textarea');
const button = page.locator('[data-action="send-as"]');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};
const textOf = (draft) => draft.text ?? draft.body;

await finish(async () => {
  await page.goto(`${base}/`);

  // A basic group: no button, and Telegram is not asked.
  await open(BASIC);
  await page.waitForTimeout(500);
  assert((await button.count()) === 0, 'no button in a basic group');
  assert(asked.length === 0, `asked for a basic group: ${asked}`);

  // A supergroup with identities: the button shows the current one.
  await open(SUPER);
  await button.waitFor({ timeout: 10000 });
  assert(asked.includes(SUPER), 'asked for the supergroup');
  assert(
    (await button.getAttribute('data-send-as-current')) === '42',
    'the user is current'
  );

  // The list: names, kinds, subscribers; the Premium-only one locked.
  await button.click();
  const dialog = page.locator('[data-dialog="send-as"]');
  await dialog.waitFor({ timeout: 5000 });
  const items = dialog.locator('[data-send-as]');
  assert((await items.count()) === 3, 'three identities');
  const news = await dialog
    .locator(`[data-send-as="${CHANNEL}"]`)
    .textContent();
  assert(news.includes('News') && news.includes('1,200'), `channel: ${news}`);
  assert(
    (await dialog.locator('[data-send-as="42"]').textContent()).includes(
      'Personal account'
    ),
    'personal account'
  );
  assert(
    await dialog.locator(`[data-send-as="${LOCKED}"]`).isDisabled(),
    'the Premium-only one is disabled'
  );

  // Pick the channel: saved, the button follows, the list closes.
  await dialog.locator(`[data-send-as="${CHANNEL}"]`).click();
  await until(
    () => saved.some((s) => s.chat === SUPER && s.sendAs === CHANNEL),
    'saved'
  );
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  assert(
    (await button.getAttribute('data-send-as-current')) === CHANNEL,
    'the button follows'
  );

  // A send from the box carries sendAs.
  await box.click();
  await box.fill('as the channel');
  await box.press('Enter');
  await until(() => sent.length === 1, 'sent');
  assert(textOf(sent[0]) === 'as the channel', 'the text');
  assert(sent[0].sendAs === CHANNEL, `sendAs: ${sent[0].sendAs}`);

  // An inline bot's result and a shared place carry it too (R-Y147).
  await box.fill('');
  await box.pressSequentially('@wiki moscow');
  await page.locator('.inline-result').first().waitFor({ timeout: 10000 });
  await box.press('Enter');
  await until(() => inlineSends.length === 1, 'inline result sent');
  assert(
    inlineSends[0].id === 'w1' && inlineSends[0].sendAs === CHANNEL,
    `inline sendAs: ${JSON.stringify(inlineSends[0])}`
  );
  await page.locator('[data-action="attach"]').click();
  await page.locator('[data-action="attach-location"]').click();
  const place = page.locator('.share-dialog');
  await place.locator('[data-field="lat"]').fill('52.52');
  await place.locator('[data-field="lon"]').fill('13.405');
  await page.locator('[data-action="location-send"]').click();
  await until(() => locations.length === 1, 'location sent');
  assert(
    locations[0].chat === SUPER && locations[0].sendAs === CHANNEL,
    `location sendAs: ${JSON.stringify(locations[0])}`
  );

  // Back to the basic group: a send has no sendAs.
  await open(BASIC);
  await box.fill('plain');
  await box.press('Enter');
  await until(() => sent.length === 2, 'sent again');
  assert(!('sendAs' in sent[1]), 'no sendAs in a basic group');
});
