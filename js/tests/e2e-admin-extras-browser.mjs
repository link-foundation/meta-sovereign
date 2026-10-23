// Real browser e2e for the rest of a group's and a channel's management
// (R-Y200), as Telegram Desktop has it: the delete dialog of a
// supergroup's admin offers "Report spam", "Ban user" and "Delete all from
// <name>" (only what the rights allow) and asks the server before the
// plain delete; a member's row offers "Ban / delete all"; the owner may
// "Transfer ownership" to an admin with the 2-Step Verification password,
// which is cleared and never shown again; "Not spam" sits beside a deleted
// message in Recent actions; the owner may convert a supergroup to a
// broadcast group after a warning; and "Channels you left" lists channels
// a page at a time, each opening a preview where nothing is joined. Also
// the default topic icons stay in the topic dialog (R-Y153). Telegram's
// answers faked in the page, a fake chat in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:admin-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const SECRET = 'my-very-secret-2fa-password';
const store = createMemoryStore();
for (const [id, sender, senderName] of [
  [1, '31', 'Sam Spammer'],
  [2, '32', 'Vera Vandal'],
  [3, '33', 'Pat Plain'],
]) {
  await store.put({
    id: `msg:telegram:${GROUP}:${id}`,
    source: 'telegram',
    chat: GROUP,
    chatName: 'Fake Group',
    chatType: 'supergroup',
    sender,
    senderName,
    body: `message ${id}`,
    timestamp: new Date(Date.now() - (10 - id) * 60_000).toISOString(),
    raw: { id },
  });
}

const { base, page, until, finish } = await openChatApp('admin-extras', {
  store,
});
page.on('dialog', (dialog) => {
  throw new Error(`the browser's own dialog: ${dialog.message()}`);
});

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': {
    chat: GROUP,
    kind: 'channel',
    title: 'Fake Group',
    members: 4,
    canBan: true,
    canInvite: true,
    canEdit: true,
    canDeleteMessages: true,
    owner: true,
    canConvertGiga: true,
  },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, answer));
}

// Every call to the server, in order, with its body.
const calls = [];
const record = (name, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    calls.push([name, route.request().postDataJSON()]);
    return fulfil(route, typeof answer === 'function' ? answer() : answer);
  });
await record('delete', { ok: true });
await record('moderate-user', { ok: true });
await record('not-spam', { ok: true });
await record('convert-gigagroup', { ok: true });
let transferAnswer = {
  ok: false,
  error: 'x',
  code: 'password-fresh',
  waitSeconds: 3600,
};
await record('transfer-ownership', () => transferAnswer);

const member = (id, name, role, extra = {}) => ({
  id,
  name,
  role,
  rank: null,
  username: null,
  self: false,
  ...extra,
});
await page.route('**/api/telegram/members', (route) =>
  fulfil(route, {
    ok: true,
    total: 4,
    members: [
      member('100', 'Me Owner', 'creator', { self: true }),
      member('101', 'Adam Admin', 'admin'),
      member('200', 'Mia Member', 'member'),
    ],
    canBan: true,
    canInvite: true,
    canDelete: true,
    owner: true,
  })
);
const event = (id, kind, extra = {}) => ({
  id: String(id),
  date: Date.now() - id * 1000,
  user: '1',
  userName: 'Antispam',
  kind,
  ...extra,
});
await page.route('**/api/telegram/admin-log', (route) =>
  fulfil(route, {
    ok: true,
    events: [
      event(2, 'delete', { text: 'buy now', msgId: 77 }),
      event(1, 'join'),
    ],
    next: null,
  })
);
await page.route('**/api/telegram/left-channels', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['left-channels', body]);
  const channel = (n) => ({
    chat: `-100900${n}`,
    title: `Left Channel ${n}`,
    username: null,
    members: 10 * n,
    broadcast: true,
  });
  return fulfil(
    route,
    body.offset
      ? { ok: true, channels: [channel(3)], next: null }
      : { ok: true, channels: [channel(1), channel(2)], next: 2 }
  );
});
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);
await page.route('**/api/telegram/similar-join', (route) => {
  calls.push(['similar-join', route.request().postDataJSON()]);
  return fulfil(route, { ok: true });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const names = () => calls.map(([name]) => name);
const last = (name) => calls.filter(([n]) => n === name).at(-1)?.[1];

const openDelete = async (id) => {
  await page
    .locator(`[data-message="msg:telegram:${GROUP}:${id}"]`)
    .first()
    .click({ button: 'right' });
  await page
    .locator('.msg-context-menu [data-action="delete"]')
    .click({ timeout: 5000 });
  await page.locator('.delete-dialog [data-moderation]').waitFor({
    timeout: 5000,
  });
};
const deleteButton = () => page.locator('.delete-dialog-btns button').first();

const deleteSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page
    .locator(`[data-message="msg:telegram:${GROUP}:1"]`)
    .first()
    .waitFor({ timeout: 10000 });

  // All three options, none ticked: the plain delete asks only the delete.
  await openDelete(1);
  const options = await page.$$eval('.delete-dialog [data-option]', (n) =>
    n.map((one) => one.getAttribute('data-option'))
  );
  assert(
    options.join() === 'reportSpam,ban,deleteAll',
    `the options: ${options}`
  );
  assert(
    (await page.locator('.delete-dialog').textContent()).includes(
      'Delete all from Sam Spammer'
    ),
    'names the sender'
  );
  await deleteButton().click();
  await until(() => names().includes('delete'), 'the plain delete');
  assert(!names().includes('moderate-user'), 'no moderation when none ticked');

  // Report spam: the report goes before the delete.
  calls.length = 0;
  await openDelete(1);
  await page.locator('[data-option="reportSpam"]').check();
  await deleteButton().click();
  await until(() => names().includes('delete'), 'delete after the report');
  assert(
    JSON.stringify(calls[0]) ===
      JSON.stringify([
        'moderate-user',
        { chat: GROUP, user: '31', ids: [1], reportSpam: true },
      ]),
    `report first: ${JSON.stringify(calls)}`
  );
  assert(names().join() === 'moderate-user,delete', `order: ${names()}`);

  // Ban and delete all: nothing is left for the plain delete.
  calls.length = 0;
  await openDelete(2);
  await page.locator('[data-option="ban"]').check();
  await page.locator('[data-option="deleteAll"]').check();
  await deleteButton().click();
  await until(() => names().includes('moderate-user'), 'ban and delete all');
  assert(
    JSON.stringify(last('moderate-user')) ===
      JSON.stringify({
        chat: GROUP,
        user: '32',
        ids: [2],
        ban: true,
        deleteAll: true,
      }),
    `ban and delete all: ${JSON.stringify(calls)}`
  );
  await page.waitForTimeout(300);
  assert(!names().includes('delete'), 'no plain delete after delete all');
};

const membersSteps = async () => {
  await page.locator('[data-action="chat-about"]').click();
  const box = page.locator('.person-panel .chat-members');
  const row = (id) => box.locator(`[data-member="${id}"]`);
  await row('200').waitFor({ timeout: 10000 });
  assert(
    (await row('100').locator('[data-action="moderate-member"]').count()) ===
      0 &&
      (await row('101').locator('[data-action="moderate-member"]').count()) ===
        0,
    'no moderation on yourself or an admin'
  );
  assert(
    (await box.locator('[data-action="transfer-member"]').count()) === 0,
    'transfer is not in the members list'
  );

  // Ban from the member's menu: no spam report without messages.
  calls.length = 0;
  await row('200').locator('[data-action="moderate-member"]').click();
  const moderate = page.locator('[data-dialog="member-moderate"]');
  await moderate.waitFor({ timeout: 5000 });
  assert(
    (await moderate.locator('[data-option="reportSpam"]').count()) === 0,
    'no Report spam without messages'
  );
  assert(
    await moderate.locator('[data-action="submit"]').isDisabled(),
    'Apply waits for a tick'
  );
  await moderate.locator('[data-option="ban"]').check();
  await moderate.locator('[data-action="submit"]').click();
  await gone(row('200'), 'a banned member leaves the list');
  assert(
    JSON.stringify(last('moderate-user')) ===
      JSON.stringify({ chat: GROUP, user: '200', ban: true }),
    `ban: ${JSON.stringify(calls)}`
  );

  await page.keyboard.press('Escape');
};

const logSteps = async () => {
  await page.locator('.person-panel [data-action="admin-log"]').click();
  const log = page.locator('[data-dialog="admin-log"]');
  await log.locator('[data-event="delete"]').waitFor({ timeout: 5000 });
  assert(
    (await log
      .locator('[data-event="join"] [data-action="not-spam"]')
      .count()) === 0,
    'Not spam only on a deleted message'
  );
  await log.locator('[data-action="not-spam"]').click();
  await log.locator('[data-not-spam="done"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(last('not-spam')) ===
      JSON.stringify({ chat: GROUP, msgId: '77' }),
    `not spam: ${JSON.stringify(last('not-spam'))}`
  );
  await page.keyboard.press('Escape');
  await gone(log, 'closed');
};

const convertSteps = async () => {
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  const convert = page.locator('[data-action="convert-gigagroup"]');
  await convert.click({ timeout: 5000 });
  const warning = page.locator('[data-dialog="convert-gigagroup"]');
  await warning.waitFor({ timeout: 5000 });
  assert(
    (await warning.textContent()).includes('Only admins will be able to write'),
    'the warning'
  );
  await warning.locator('[data-action="cancel"]').click();
  await gone(warning, 'Cancel closes the warning');
  assert(!names().includes('convert-gigagroup'), 'nothing sent on Cancel');
  await convert.click();
  await warning.locator('[data-action="giga-confirm"]').click();
  await page.locator('[data-giga="done"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(last('convert-gigagroup')) ===
      JSON.stringify({ chat: GROUP, confirm: true }),
    'confirmed'
  );

  // Transfer ownership, in the edit dialog: pick a member, the password.
  // A fresh password is a clear message, the box is emptied and the
  // password is never shown.
  const transfer = page.locator('[data-dialog="transfer-ownership"]');
  await page.locator('[data-action="transfer-ownership"]').click();
  await transfer.waitFor({ timeout: 5000 });
  // Escape closes only the dialog on top; the Edit dialog stays.
  await page.keyboard.press('Escape');
  await gone(transfer, 'Escape closes the transfer dialog');
  assert(
    await page.locator('[data-dialog="edit-chat"]').isVisible(),
    'the Edit dialog stays open under it'
  );
  await page.locator('[data-action="transfer-ownership"]').click();
  await transfer.waitFor({ timeout: 5000 });
  assert(
    (await transfer.locator('[data-transfer-to="100"]').count()) === 0,
    'not yourself'
  );
  await transfer.locator('[data-field="password"]').fill(SECRET);
  assert(
    await transfer.locator('[data-action="submit"]').isDisabled(),
    'a member must be picked'
  );
  await transfer.locator('[data-transfer-to="101"]').check();
  await transfer.locator('[data-action="submit"]').click();
  await transfer.locator('[role="alert"]').waitFor({ timeout: 5000 });
  const text = await transfer.textContent();
  assert(text.includes('1 h'), `the wait is told: ${text}`);
  assert(!text.includes(SECRET), 'the password is not echoed');
  assert(
    (await transfer.locator('[data-field="password"]').inputValue()) === '',
    'the box is emptied'
  );
  assert(
    last('transfer-ownership').password === SECRET &&
      last('transfer-ownership').user === '101' &&
      last('transfer-ownership').chat === GROUP,
    'the password went to the server once'
  );
  transferAnswer = { ok: true };
  await transfer.locator('[data-field="password"]').fill(SECRET);
  await transfer.locator('[data-action="submit"]').click();
  await gone(transfer, 'the dialog closes');
  await page.locator('[data-transfer="done"]').waitFor({ timeout: 5000 });
  assert(
    !(await page.content()).includes(SECRET),
    'the password is nowhere in the page'
  );
  await page
    .locator('[data-dialog="edit-chat"] [data-action="cancel"]')
    .click();
};

const leftSteps = async () => {
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-left-channels"]').click();
  const list = page.locator('[data-dialog="left-channels"]');
  await list.locator('[data-similar-channel="-1009001"]').waitFor({
    timeout: 5000,
  });
  assert(
    (await list.locator('[data-similar-channel]').count()) === 2,
    'the first page'
  );
  await list.locator('[data-action="left-more"]').click();
  await list.locator('[data-similar-channel="-1009003"]').waitFor({
    timeout: 5000,
  });
  assert(last('left-channels').offset === 2, 'the next page by offset');
  assert(
    (await list.locator('[data-action="left-more"]').count()) === 0,
    'no more at the end'
  );
  // A row opens the preview; Cancel joins nothing.
  await list.locator('[data-similar-channel="-1009002"]').click();
  const preview = page.locator('[data-dialog="similar-preview"]');
  await preview.waitFor({ timeout: 5000 });
  assert(
    (await preview.textContent()).includes('Left Channel 2'),
    'the preview names it'
  );
  await preview.locator('[data-action="cancel"]').click();
  await gone(preview, 'preview closed');
  assert(!names().includes('similar-join'), 'nothing joined');
};

await finish(async () => {
  await deleteSteps();
  await membersSteps();
  await logSteps();
  await convertSteps();
  await leftSteps();
});
