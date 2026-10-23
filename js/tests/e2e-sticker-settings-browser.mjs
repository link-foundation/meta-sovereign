// Real browser e2e for Settings → Stickers and emoji (R-Y169), as Telegram
// Desktop has it: from "My Telegram profile" a dialog lists the installed
// sticker sets in the user's order (custom emoji sets on a second tab).
// A set moves up or down (the new order is sent whole), is archived,
// brought back from "Archived stickers" (a page at a time) with Add, and
// removed only after an in-page question. Telegram's answers faked in the
// page (the fake keeps the sets' order), a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sticker-settings

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const { base, page, until, finish } = await openChatApp('sticker-settings', {
  store,
});

const set = (id, title, extra = {}) => ({
  id,
  title,
  count: 5,
  format: 'webp',
  emoji: false,
  official: false,
  ...extra,
});
// The fake account: what it keeps, in order, and what it was asked.
const fake = {
  stickers: [set('1', 'Cats'), set('2', 'Dogs'), set('3', 'Birds')],
  emoji: [
    set('11', 'Faces', { emoji: true, count: 40 }),
    set('12', 'Food', { emoji: true, count: 30 }),
  ],
  archived: [set('21', 'Old A'), set('22', 'Old B')],
  asked: [],
};
const kindOf = (body) => (body.emojis ? fake.emoji : fake.stickers);
const take = (list, id) => {
  const at = list.findIndex((s) => s.id === id);
  return at < 0 ? null : list.splice(at, 1)[0];
};
const findAnywhere = (id) =>
  [fake.stickers, fake.emoji, fake.archived]
    .map((l) => take(l, id))
    .find(Boolean);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/sticker?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: '',
    about: '',
    username: 'ann',
    phone: '',
    hasPhoto: false,
    aboutMax: 70,
  })
);
const post = (name, handler) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    fake.asked.push([name, body]);
    return fulfil(route, handler(body));
  });
await post('sticker-sets', (body) => ({ ok: true, sets: [...kindOf(body)] }));
await post('sticker-sets-reorder', (body) => {
  const list = kindOf(body);
  const order = body.ids.map((id) => list.find((s) => s.id === id));
  list.splice(0, list.length, ...order);
  return { ok: true };
});
await post('sticker-set-archive', (body) => {
  fake.archived.push(findAnywhere(body.id));
  return { ok: true, id: body.id };
});
await post('sticker-set-add', (body) => {
  const found = findAnywhere(body.id);
  (found.emoji ? fake.emoji : fake.stickers).push(found);
  return { ok: true, id: body.id };
});
await post('sticker-set-remove', (body) => {
  findAnywhere(body.id);
  return { ok: true, id: body.id };
});
// Archived sets, one at a time, so "Show more" is needed.
await post('sticker-sets-archived', (body) => {
  const from = body.offsetId
    ? fake.archived.findIndex((s) => s.id === body.offsetId) + 1
    : 0;
  const page1 = fake.archived.slice(from, from + 1);
  return {
    ok: true,
    count: fake.archived.length,
    sets: page1,
    next: from + 1 < fake.archived.length ? page1.at(-1).id : null,
  };
});

const dialog = page.locator('[data-dialog="sticker-settings"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const order = async () =>
  dialog
    .locator('[data-set]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-set')));
const sentLast = (name) => fake.asked.filter(([n]) => n === name).at(-1)?.[1];
const row = (id) => dialog.locator(`[data-set="${id}"]`);

const openSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-sticker-settings"]').click();
  await row('1').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(await order()) === '["1","2","3"]',
    'the sets in the account order'
  );
  const text = await row('1').textContent();
  assert(text.includes('Cats') && text.includes('5 stickers'), `row: ${text}`);
  assert((await row('1').locator('img').count()) === 1, 'a cover picture');
  assert(
    (await row('1').locator('[data-action="set-up"]').isDisabled()) &&
      (await row('3').locator('[data-action="set-down"]').isDisabled()),
    'the ends cannot move further'
  );
};

const reorderSteps = async () => {
  await row('1').locator('[data-action="set-down"]').click();
  await until(async () => (await order()).join() === '2,1,3', 'moved down');
  assert(
    JSON.stringify(sentLast('sticker-sets-reorder')) ===
      '{"ids":["2","1","3"],"emojis":false}',
    `reorder sent whole: ${JSON.stringify(sentLast('sticker-sets-reorder'))}`
  );
  await row('3').locator('[data-action="set-up"]').click();
  await until(async () => (await order()).join() === '2,3,1', 'moved up');
  assert(
    fake.stickers.map((s) => s.id).join() === '2,3,1',
    'the account keeps the order'
  );
};

const archiveSteps = async () => {
  await row('3').locator('[data-action="set-archive"]').click();
  await gone(row('3'), 'archived set leaves the list');
  assert(
    JSON.stringify(sentLast('sticker-set-archive')) === '{"id":"3"}',
    'archive sent'
  );
  await dialog.locator('[data-action="toggle-archived"]').click();
  await row('21').waitFor({ timeout: 5000 });
  assert(
    (await row('22').count()) === 0,
    'archived sets come a page at a time'
  );
  await dialog.locator('[data-action="more-archived"]').click();
  await row('22').waitFor({ timeout: 5000 });
  // The set archived a moment ago is on the last page.
  await dialog.locator('[data-action="more-archived"]').click();
  await row('3').waitFor({ timeout: 5000 });
  await gone(dialog.locator('[data-action="more-archived"]'), 'no more pages');
  await row('21').locator('[data-action="set-add"]').click();
  await gone(row('21'), 'restored set leaves the archive');
  assert(
    JSON.stringify(sentLast('sticker-set-add')) === '{"id":"21"}',
    'add sent'
  );
  await dialog.locator('[data-action="toggle-archived"]').click();
  await row('21').waitFor({ timeout: 5000 });
  assert(
    (await order()).join() === '2,1,21',
    `restored at the end: ${(await order()).join()}`
  );
};

const removeSteps = async () => {
  await row('2').locator('[data-action="set-remove"]').click();
  await dialog.locator('[data-action="cancel-remove-set"]').click();
  assert((await row('2').count()) === 1, 'Keep leaves the set');
  assert(!sentLast('sticker-set-remove'), 'nothing removed before Remove');
  await row('2').locator('[data-action="set-remove"]').click();
  assert(
    (await row('2').textContent()).includes('Remove "Dogs"'),
    'asked in the page'
  );
  await dialog.locator('[data-action="confirm-remove-set"]').click();
  await gone(row('2'), 'removed set leaves the list');
  assert(
    JSON.stringify(sentLast('sticker-set-remove')) === '{"id":"2"}',
    'remove sent'
  );
};

const emojiSteps = async () => {
  await dialog.locator('[data-tab="emoji"]').click();
  await row('11').waitFor({ timeout: 5000 });
  assert((await order()).join() === '11,12', 'the emoji sets');
  assert((await row('11').textContent()).includes('40 emoji'), 'emoji count');
  await row('12').locator('[data-action="set-up"]').click();
  await until(async () => (await order()).join() === '12,11', 'emoji moved');
  assert(
    JSON.stringify(sentLast('sticker-sets-reorder')) ===
      '{"ids":["12","11"],"emojis":true}',
    `emoji reorder: ${JSON.stringify(sentLast('sticker-sets-reorder'))}`
  );
  await dialog.locator('[data-tab="stickers"]').click();
  await row('1').waitFor({ timeout: 5000 });
};

const closeSteps = async () => {
  // Escape closes only this dialog; the profile card stays.
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes Stickers and emoji');
  assert(
    (await page.locator('[data-dialog="my-profile"]').count()) === 1,
    'the profile card stays'
  );
};

await finish(async () => {
  await openSteps();
  await reorderSteps();
  await archiveSteps();
  await removeSteps();
  await emojiSteps();
  await closeSteps();
});
