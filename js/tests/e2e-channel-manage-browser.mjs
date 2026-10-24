// Real browser e2e for managing a channel (R-Y216), as Telegram Desktop lets
// its owner:
// - Edit → Channel type: Public/Private, the link checked as it is typed,
//   saved with the button (never before); when Telegram says there are too
//   many public channels, they are listed with "Revoke link";
// - Edit → Appearance: the name colour saved with the button;
// - Edit → Delete channel: a dialog that names the chat; Escape closes only
//   it and deletes nothing; the confirmation posts the `destroy` action;
// - joining a channel refused for the limit opens the list of inactive
//   channels; only the ticked ones are left, on the press of Leave.
// Telegram's answers faked in the page, a fake channel in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:channel-manage

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1004242';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHANNEL}:1`,
  source: 'telegram',
  chat: CHANNEL,
  chatName: 'Fake Channel',
  chatType: 'channel',
  sender: '77',
  senderName: 'Fake Erin',
  body: 'join us https://t.me/+PlainHash123',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('channel-manage', {
  store,
});

const calls = {
  check: [],
  save: [],
  revoke: [],
  color: [],
  destroy: [],
  leave: [],
};
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
    chat: CHANNEL,
    kind: 'channel',
    broadcast: true,
    title: 'Fake Channel',
    members: 150,
    owner: true,
    canEdit: true,
    username: '',
    canAppearance: true,
    look: { color: null, profileColor: null, status: null },
  })
);
await page.route('**/api/telegram/profile-colors', (route) =>
  fulfil(route, {
    ok: true,
    name: [{ id: 3, colors: ['#ff5555'] }],
    profile: [{ id: 4, colors: ['#5555ff'] }],
  })
);
await page.route('**/api/telegram/emoji-statuses', (route) =>
  fulfil(route, { ok: true, defaults: [], recent: [], current: null })
);

// The link: "crowded_one" meets the limit until a link is revoked.
let crowded = true;
await page.route('**/api/telegram/channel-username-check', (route) => {
  const body = route.request().postDataJSON();
  calls.check.push(body);
  return body.username === 'crowded_one' && crowded
    ? fulfil(route, { ok: false, error: 'x', code: 'too-many-public' })
    : fulfil(route, { ok: true, status: 'available' });
});
await page.route('**/api/telegram/channel-username-save', (route) => {
  calls.save.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/public-channels', (route) =>
  fulfil(route, {
    ok: true,
    channels: [{ chat: '-1009001', title: 'Old Public', username: 'old_pub' }],
  })
);
await page.route('**/api/telegram/public-link-revoke', (route) => {
  calls.revoke.push(route.request().postDataJSON());
  crowded = false;
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/channel-color-save', (route) => {
  calls.color.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/remove-chat', (route) => {
  calls.destroy.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, deleted: 0 });
});

// Joining: the first press meets the limit.
await page.route('**/api/telegram/invite-check', (route) =>
  fulfil(route, {
    ok: true,
    already: false,
    invite: {
      title: 'Test Channel',
      about: '',
      members: 12,
      channel: true,
      broadcast: true,
      megagroup: false,
      requestNeeded: false,
    },
  })
);
await page.route('**/api/telegram/invite-join', (route) =>
  fulfil(route, { ok: false, error: 'x', code: 'too-many-chats' })
);
await page.route('**/api/telegram/inactive-channels', (route) =>
  fulfil(route, {
    ok: true,
    channels: [
      {
        chat: '-1008001',
        title: 'Quiet One',
        date: 1_600_000_000,
        broadcast: true,
      },
      {
        chat: '-1008002',
        title: 'Quiet Two',
        date: 1_500_000_000,
        broadcast: false,
      },
    ],
  })
);
await page.route('**/api/telegram/leave-channels', (route) => {
  const body = route.request().postDataJSON();
  calls.leave.push(body);
  return fulfil(route, { ok: true, left: body.chats });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const edit = page.locator('[data-dialog="edit-chat"]');

const openEdit = async () => {
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  await edit.waitFor({ timeout: 5000 });
};

const typeSteps = async () => {
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await openEdit();
  const row = edit.locator('[data-action="chat-type"]');
  assert((await row.textContent()).includes('Private'), 'private to begin');
  await row.click();
  const dialog = page.locator('[data-dialog="chat-type"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-link-kind="public"]').click();
  await dialog.locator('[data-field="public-link"]').fill('t.me/crowded_one');
  await dialog.locator('[data-crowded]').waitFor({ timeout: 5000 });
  assert(calls.save.length === 0, 'nothing saved while typing');
  await dialog.locator('[data-action="revoke-link"]').click();
  await until(() => calls.revoke.length === 1, 'the link is revoked');
  assert(calls.revoke[0].chat === '-1009001', 'the chosen channel');
  await dialog
    .locator('[data-link-status="available"]')
    .waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="submit"]').click();
  await until(() => calls.save.length === 1, 'the link is saved');
  assert(
    JSON.stringify(calls.save[0]) ===
      JSON.stringify({ chat: CHANNEL, username: 'crowded_one' }),
    `saved: ${JSON.stringify(calls.save[0])}`
  );
  await gone(dialog, 'the dialog closes');
  await until(
    async () => (await row.textContent()).includes('t.me/crowded_one'),
    'the row shows the link'
  );
};

const lookSteps = async () => {
  await edit.locator('[data-action="chat-look"]').click();
  const dialog = page.locator('[data-dialog="chat-look"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-swatch="name:3"]').click();
  assert(calls.color.length === 0, 'nothing saved before the press');
  await dialog.locator('[data-action="submit"]').click();
  await until(() => calls.color.length === 1, 'the colour is saved');
  assert(
    calls.color[0].chat === CHANNEL &&
      calls.color[0].forProfile === false &&
      calls.color[0].color === 3,
    `colour: ${JSON.stringify(calls.color[0])}`
  );
  await gone(dialog, 'the dialog closes');
};

const deleteSteps = async () => {
  await edit.locator('[data-action="delete-chat"]').click();
  const ask = page.locator('[data-dialog="delete-chat"]');
  await ask.waitFor({ timeout: 5000 });
  assert((await ask.textContent()).includes('Fake Channel'), 'names the chat');
  await page.keyboard.press('Escape');
  await gone(ask, 'Escape closes the question');
  assert(await edit.isVisible(), 'Edit stays');
  assert(calls.destroy.length === 0, 'nothing deleted by Escape');
  await edit.locator('[data-action="delete-chat"]').click();
  await ask.waitFor({ timeout: 5000 });
  await ask.locator('[data-action="delete-confirm"]').click();
  await until(() => calls.destroy.length === 1, 'the delete is posted');
  assert(
    JSON.stringify(calls.destroy[0]) ===
      JSON.stringify({ chat: CHANNEL, action: 'destroy' }),
    `destroy: ${JSON.stringify(calls.destroy[0])}`
  );
};

const limitSteps = async () => {
  await page.goto(`${base}/`);
  await page.reload();
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  const link = page
    .locator(`[data-message="msg:telegram:${CHANNEL}:1"] a.msg-link`)
    .first();
  await link.waitFor({ timeout: 15000 });
  await link.click();
  const invite = page.locator('[data-dialog="invite"]');
  await invite.locator('[data-action="join"]').click();
  const dialog = page.locator('[data-dialog="inactive-channels"]');
  await dialog.waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-limit-chat]').count()) === 2,
    'two inactive channels listed'
  );
  assert(
    await dialog.locator('[data-action="submit"]').isDisabled(),
    'Leave waits for a choice'
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes the list');
  assert(calls.leave.length === 0, 'nothing left by Escape');
  await invite.locator('[data-action="cancel"]').click();
  await gone(invite, 'the invite closes');
  await link.click();
  await invite.locator('[data-action="join"]').click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-limit-chat="-1008002"] input').check();
  await dialog.locator('[data-action="submit"]').click();
  await until(() => calls.leave.length === 1, 'leave posted');
  assert(
    JSON.stringify(calls.leave[0]) === JSON.stringify({ chats: ['-1008002'] }),
    `left: ${JSON.stringify(calls.leave[0])}`
  );
  await gone(dialog, 'the list closes');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await typeSteps();
  await lookSteps();
  await deleteSteps();
  await limitSteps();
});
