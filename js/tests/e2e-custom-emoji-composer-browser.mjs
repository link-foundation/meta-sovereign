// Real browser e2e for custom emoji in the composer (R-Y214), as Telegram
// Desktop has them:
// - the emoji panel shows the group's emoji pack first, under "Group
//   emoji", then the recent ones, the standard categories and a section
//   for each custom emoji set of the account;
// - Telegram's emoji groups ("Love", "Joy") are icon tabs that filter the
//   standard grid by their emoticons, and a second press clears it;
// - a custom emoji picked goes into the message box as the markdown
//   `![😀](tg://emoji?id=…)`; the message sent carries it and parses to
//   the custom emoji entity; the pick leads the recent ones, kept on the
//   next visit;
// - without Premium a custom emoji shows a "Premium needed" note instead
//   of typing, except the group's own pack.
// Telegram's answers faked in the page, a fake group in a memory store, a
// fake sender that records, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:custom-emoji-composer

import { createMemoryStore } from '../src/storage/universal.js';
import { parseFormatted } from '../src/sources/telegram-format.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1007';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'channel',
  sender: '77',
  senderName: 'Fake Erin',
  body: 'hello group',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const sent = [];
const { base, page, until, finish } = await openChatApp(
  'custom-emoji-composer',
  {
    store,
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fake' };
    },
  }
);

// A 1x1 PNG for every custom emoji picture.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const item = (id, emoji) => ({
  id: String(id),
  kind: 'sticker',
  format: 'webp',
  emoji,
  w: 100,
  h: 100,
});
const PACK = { id: '9', shortName: 'FakePack', title: 'Fake Pack', count: 2 };
let premium = true;
const asked = [];

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/read', (route) =>
  fulfil(route, { ok: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: GROUP,
    kind: 'channel',
    title: 'Fake Group',
    members: 150,
    groupStickers: { stickers: null, emojis: PACK },
  })
);
await page.route('**/api/telegram/emoji-panel-info', (route) => {
  asked.push('info');
  return fulfil(route, {
    ok: true,
    premium,
    groups: [
      { title: 'Love', iconEmojiId: '7001', emoticons: ['❤️', '😍'] },
      { title: 'Joy', iconEmojiId: '7002', emoticons: ['😂'] },
    ],
  });
});
await page.route('**/api/telegram/sticker-sets', (route) =>
  fulfil(route, {
    ok: true,
    sets: [{ id: '5', title: 'Fun', count: 2, format: 'webp', emoji: true }],
  })
);
await page.route('**/api/telegram/sticker-set', (route) =>
  fulfil(route, {
    ok: true,
    id: '5',
    stickers: [item(5001, '😀'), item(5002, '🔥')],
  })
);
await page.route('**/api/telegram/sticker-set-box', (route) =>
  fulfil(route, {
    ok: true,
    set: { ...PACK, format: 'webp', emoji: true, installed: false },
    items: [item(9001, '🐱'), item(9002, '🐶')],
  })
);
await page.route('**/api/telegram/stickers', (route) =>
  fulfil(route, { ok: true, faved: [], recent: [], sets: [] })
);
await page.route('**/api/telegram/custom-emoji*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);

const panel = page.locator('.emoji-panel');
const open = async () => {
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  const box = page.locator('.chat-composer textarea');
  await box.waitFor({ timeout: 15000 });
  await page.locator('[data-action="emoji"]').click();
  await panel.waitFor({ timeout: 5000 });
  return box;
};
// The account's sets load when scrolled near (the bar's star jumps there).
const toSets = () => panel.locator('[data-jump="custom"]').click();
const pick = (id) => panel.locator(`[data-custom-pick="${id}"]`).first();

await finish(async () => {
  await page.goto(`${base}/`);
  let box = await open();

  // The group's pack first, the account's set after the standard emoji.
  await panel.locator('[data-category="group-emoji"]').waitFor();
  await panel.locator('[data-category="set-5"]').waitFor();
  const order = await panel
    .locator('[data-category]')
    .evaluateAll((s) => s.map((x) => x.dataset.category));
  assert(order[0] === 'group-emoji', `group pack first: ${order.slice(0, 3)}`);
  assert(order.at(-1) === 'set-5', `sets last: ${order.at(-1)}`);
  const title = await panel
    .locator('[data-category="group-emoji"] .emoji-section-title')
    .innerText();
  assert(title === 'Group emoji', `title: ${title}`);

  // The emoji groups filter the grid; a second press clears it.
  await panel.locator('[data-emoji-group="Love"]').waitFor();
  await panel.locator('[data-emoji-group="Love"]').click();
  await until(
    async () => (await panel.locator('[data-category="group"]').count()) === 1,
    'filtered'
  );
  const cells = await panel
    .locator('[data-category="group"] .emoji-cell')
    .evaluateAll((c) => c.map((x) => x.dataset.emoji));
  assert(cells.join() === '❤️,😍', `love: ${cells}`);
  assert((await panel.locator('[data-category="people"]').count()) === 0);
  await panel.locator('[data-emoji-group="Love"]').click();
  await panel.locator('[data-category="people"]').waitFor();

  // A custom emoji goes in as the markdown, at the caret.
  await box.fill('hi ');
  await toSets();
  await pick(5001).click();
  const typed = 'hi ![😀](tg://emoji?id=5001)';
  await until(
    async () => (await box.inputValue()) === typed,
    `typed: ${await box.inputValue()}`
  );
  await page.keyboard.press('Escape');
  await box.press('Enter');
  await until(() => sent.length === 1, 'sent');
  assert(sent[0].text === typed, `sent: ${sent[0].text}`);
  const { text, entities } = parseFormatted(sent[0].text);
  assert(text === 'hi 😀', `plain text: ${text}`);
  assert(
    entities.length === 1 &&
      entities[0].type === 'customEmoji' &&
      entities[0].documentId === '5001' &&
      entities[0].offset === 3 &&
      entities[0].length === 2,
    `entity: ${JSON.stringify(entities)}`
  );

  // The pick leads the recent ones, next time too (in this browser).
  await page.reload();
  box = await open();
  await pick(9001).waitFor();
  const recent = await panel
    .locator('[data-category="recent"] [data-custom-pick]')
    .evaluateAll((c) => c.map((x) => x.dataset.customPick));
  assert(recent[0] === '5001', `recent: ${recent}`);

  // Without Premium: a note, nothing typed — except the group's own pack.
  premium = false;
  await page.reload();
  box = await open();
  await box.fill('');
  await toSets();
  await pick(5002).click();
  await panel.locator('[data-note="premium"]').waitFor({ timeout: 5000 });
  assert((await box.inputValue()) === '', 'nothing typed without Premium');
  await pick(9001).click();
  await until(
    async () => (await box.inputValue()) === '![🐱](tg://emoji?id=9001)',
    `own pack: ${await box.inputValue()}`
  );
  assert(
    (await panel.locator('[data-note="premium"]').count()) === 0,
    'the note goes with a pick that works'
  );
  assert(asked.length >= 3, 'the panel info was asked');
});
