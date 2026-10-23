// Real browser e2e for a group's members in the info column (R-Y125), as
// Telegram Desktop lists them: the count, a search box, rows with an
// initial, the name and an "owner" or "admin" badge with the rank; "Show
// more" reads the next page; a search asks the server by words; "Remove"
// (only where the user may ban, and not on admins) is asked in the page,
// never by the browser, and the row goes once the server answers; a row
// opens that person's chat. Telegram's answers faked in the page, a fake
// chat in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:members

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const PAGE = 50;
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'supergroup',
  sender: '31',
  senderName: 'Someone',
  body: 'hello group',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('members', { store });
page.on('dialog', (dialog) => {
  throw new Error(`the browser's own dialog: ${dialog.message()}`);
});

// 60 members: the owner, an admin with a rank, yourself, then others.
const everyone = [
  { id: '100', name: 'Olga Owner', role: 'creator', rank: null },
  { id: '101', name: 'Adam Admin', role: 'admin', rank: 'moderator' },
  { id: '102', name: 'Me Myself', role: 'member', rank: null, self: true },
  ...Array.from({ length: 57 }, (_, i) => ({
    id: String(200 + i),
    name: `Person ${200 + i}`,
    role: 'member',
    rank: null,
  })),
].map((m) => ({ username: null, self: false, ...m }));

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: GROUP,
    kind: 'group',
    title: 'Fake Group',
    members: 60,
  })
);
const asked = [];
await page.route('**/api/telegram/members', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  const words = (body.q ?? '').toLowerCase();
  const found = everyone.filter((m) => m.name.toLowerCase().includes(words));
  return fulfil(route, {
    ok: true,
    total: found.length,
    members: found.slice(body.offset, body.offset + body.limit),
    canBan: true,
    canInvite: false,
  });
});
const removed = [];
await page.route('**/api/telegram/member-remove', (route) => {
  removed.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const box = page.locator('.person-panel .chat-members');
const row = (id) => box.locator(`[data-member="${id}"]`);
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await row('100').waitFor({ timeout: 10000 });

  // The count, the first page, the badges.
  assert(
    (await box.locator('h3').textContent()).includes('60'),
    'the count shows'
  );
  assert((await box.locator('.member-row').count()) === PAGE, 'first page');
  assert(
    asked[0].chat === GROUP && asked[0].limit === PAGE && asked[0].offset === 0,
    `first ask: ${JSON.stringify(asked[0])}`
  );
  assert(
    (await row('100').locator('.member-badge').textContent()) === 'owner',
    'the owner badge'
  );
  assert(
    (await row('101').locator('.member-badge').textContent()) ===
      'admin · moderator',
    'the admin badge with its rank'
  );
  assert(
    (await row('100').locator('.member-initial').textContent()) === 'O',
    'the initial'
  );
  assert(
    (await row('100').locator('[data-action="remove-member"]').count()) === 0 &&
      (await row('101').locator('[data-action="remove-member"]').count()) ===
        0 &&
      (await row('102').locator('[data-action="remove-member"]').count()) === 0,
    'no Remove on the owner, an admin or yourself'
  );

  // More: the next page.
  await box.locator('[data-action="more-members"]').click();
  await until(
    async () => (await box.locator('.member-row').count()) === 60,
    'all'
  );
  assert(asked.at(-1).offset === PAGE, 'the next page asked by offset');
  assert(
    (await box.locator('[data-action="more-members"]').count()) === 0,
    'no more button at the end'
  );

  // Search asks the server by words.
  await box.locator('.member-search').fill('Person 250');
  await until(
    async () => (await box.locator('.member-row').count()) === 1,
    'found'
  );
  assert(asked.at(-1).q === 'Person 250', 'the words asked');
  await box.locator('.member-search').fill('');
  await until(
    async () => (await box.locator('.member-row').count()) === PAGE,
    'back'
  );

  // Remove: asked in the page; Cancel does nothing; Remove goes.
  const dialog = page.locator('[data-dialog="member-remove"]');
  await row('200').locator('[data-action="remove-member"]').click();
  await dialog.waitFor({ timeout: 5000 });
  assert((await dialog.textContent()).includes('Person 200'), 'names them');
  await dialog.locator('[data-action="cancel"]').click();
  await gone(dialog, 'Cancel closes');
  assert(removed.length === 0, 'nothing removed on Cancel');
  await row('200').locator('[data-action="remove-member"]').click();
  await dialog.locator('[data-action="remove-confirm"]').click();
  await gone(dialog, 'closed after Remove');
  assert(
    removed.length === 1 &&
      removed[0].chat === GROUP &&
      removed[0].user === '200',
    `removed: ${JSON.stringify(removed)}`
  );
  await gone(row('200'), 'the row goes');
  assert((await box.locator('h3').textContent()).includes('59'), 'count drops');

  // A row opens that person's chat.
  await row('201').locator('[data-action="open-member"]').click();
  await until(
    () =>
      page.evaluate(() =>
        globalThis.location.hash.includes('chat=telegram:201')
      ),
    'the person chat opens'
  );
});
