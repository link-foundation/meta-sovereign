// Real browser e2e for a new group, a new channel and editing a chat's info
// (R-Y129), as Telegram Desktop does them: the list's "+" offers New group
// and New channel; a group is made in two steps (pick contacts with a
// search box and checks, then name it), a channel takes a name and a
// description; the new chat opens; Telegram's refusals show as text. In a
// chat the user may edit, the info column has Edit: a dialog with the name,
// the description and a photo (set from a file, or removed); only what
// changed is sent and the column shows the new values. Telegram's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-create

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Editable Group',
  chatType: 'supergroup',
  sender: '31',
  senderName: 'Some Member',
  body: 'hi all',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('chat-create', {
  store,
});

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
    title: 'Editable Group',
    members: 12,
    about: 'Old about',
    canEdit: true,
  })
);
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      { id: '4', name: 'Alice Ant', username: 'alice' },
      { id: '5', name: 'Bob Bee', username: null },
      { id: '6', name: 'Carol Cat', username: null },
    ],
  })
);
const created = [];
await page.route('**/api/telegram/group-create', (route) => {
  created.push(['group', route.request().postDataJSON()]);
  return fulfil(route, { ok: true, chat: '-77', title: 'Team' });
});
await page.route('**/api/telegram/channel-create', (route) => {
  const body = route.request().postDataJSON();
  created.push(['channel', body]);
  return body.title === 'Full'
    ? fulfil(route, { ok: false, error: 'x', code: 'too-many-chats' })
    : fulfil(route, { ok: true, chat: '-1008', title: body.title });
});
const edits = [];
await page.route('**/api/telegram/chat-edit', (route) => {
  edits.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
let uploads = 0;
await page.route('**/api/telegram/upload*', (route) => {
  uploads += 1;
  return fulfil(route, { ok: true, token: 'tok1', name: 'p.png', size: 4 });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const hash = () => page.evaluate(() => globalThis.location.hash);
const menu = async (action) => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator(`[data-action="${action}"]`).click();
};

const groupSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).waitFor();
  const dialog = page.locator('[data-dialog="new-group"]');
  await menu('new-group');
  await dialog.locator('[data-contact="4"]').waitFor({ timeout: 5000 });
  // The search box narrows the contacts.
  await dialog.locator('[data-field="search"]').fill('bob');
  await until(
    async () => (await dialog.locator('[data-contact]').count()) === 1,
    'the search narrows'
  );
  await dialog.locator('[data-field="search"]').fill('');
  // Next with nobody picked is refused in the page.
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert(
    (await dialog.textContent()).includes('Pick at least one'),
    'nobody picked'
  );
  await dialog.locator('[data-contact="4"]').check();
  await dialog.locator('[data-contact="6"]').check();
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[data-field="title"]').fill('Team');
  assert(created.length === 0, 'nothing created before Create');
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Create');
  assert(
    JSON.stringify(created[0]) ===
      JSON.stringify(['group', { title: 'Team', users: ['4', '6'] }]),
    `created: ${JSON.stringify(created)}`
  );
  await until(async () => (await hash()) === '#chat=telegram:-77', 'opens');
  // Escape cancels.
  await menu('new-group');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
  assert(created.length === 1, 'Escape created nothing');
};

const channelSteps = async () => {
  const dialog = page.locator('[data-dialog="new-channel"]');
  await menu('new-channel');
  await dialog.locator('[data-field="title"]').fill('Full');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert(
    (await dialog.textContent()).includes('too many groups and channels'),
    'the error is text'
  );
  await dialog.locator('[data-field="title"]').fill('News');
  await dialog.locator('[data-field="about"]').fill('Daily news');
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Create');
  assert(
    JSON.stringify(created.at(-1)) ===
      JSON.stringify(['channel', { title: 'News', about: 'Daily news' }]),
    `created: ${JSON.stringify(created.at(-1))}`
  );
  await until(async () => (await hash()) === '#chat=telegram:-1008', 'opens');
};

const editSteps = async () => {
  await page.evaluate(() => {
    globalThis.location.hash = 'chat=telegram:-1005';
  });
  await page.locator('[data-action="chat-about"]').click();
  const panel = page.locator('.person-panel');
  await panel.locator('[data-action="edit-chat"]').click();
  const dialog = page.locator('[data-dialog="edit-chat"]');
  assert(
    (await dialog.locator('[data-field="about"]').inputValue()) === 'Old about',
    'the description is filled in'
  );
  // Only what changed: the title, and the photo uploaded first.
  await dialog.locator('[data-field="title"]').fill('Renamed');
  await dialog.locator('[data-field="photo"]').setInputFiles({
    name: 'p.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1, 2, 3, 4]),
  });
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Save');
  assert(uploads === 1, 'the photo was uploaded');
  assert(
    JSON.stringify(edits[0]) ===
      JSON.stringify({ chat: GROUP, title: 'Renamed', photo: 'tok1' }),
    `edit: ${JSON.stringify(edits[0])}`
  );
  await until(
    async () =>
      (await panel.locator('.profile-name').textContent()) === 'Renamed',
    'the new name shows'
  );
  // Remove photo and a new description.
  await panel.locator('[data-action="edit-chat"]').click();
  await dialog.locator('[data-field="about"]').fill('New about');
  await dialog.locator('[data-action="remove-photo"]').click();
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Save');
  assert(
    JSON.stringify(edits[1]) ===
      JSON.stringify({ chat: GROUP, about: 'New about', photo: 'remove' }),
    `edit: ${JSON.stringify(edits[1])}`
  );
  await until(
    async () =>
      (await panel.locator('.profile-about').textContent()) === 'New about',
    'the new description shows'
  );
};

await finish(async () => {
  await groupSteps();
  await channelSteps();
  await editSteps();
});
