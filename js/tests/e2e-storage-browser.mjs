// Real browser e2e for local storage management, reaction notifications,
// resetting all notifications and the automatic-download reset (R-Y215),
// as Telegram Desktop has them: Settings → Advanced → Manage local storage
// shows the cache by kind with sizes, Clear per kind posts that kind,
// Clear all asks first (Escape closes only the question) and then posts,
// the limits post their choice; Settings → Notifications has a Reactions
// section whose changes post and a "Reset all notifications" behind a
// question (Escape closes only it) after which the page loads the notify
// settings again; "Reset to default" in the automatic download section
// maps Telegram's medium preset. Telegram's and the server's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:storage

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'supergroup',
  sender: '42',
  senderName: 'Ann',
  body: 'hello',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('storage', { store });
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

const calls = [];
const MB = 1024 * 1024;
let kinds = {
  photos: { bytes: 3 * MB, files: 12 },
  videos: { bytes: 2048 * MB, files: 3 },
  voice: { bytes: 0, files: 0 },
  files: { bytes: 500 * 1024, files: 2 },
  stickers: { bytes: 100, files: 1 },
  other: { bytes: 0, files: 0 },
};
let limits = { maxGb: 0, olderDays: 0 };
const totalOf = () => ({
  bytes: Object.values(kinds).reduce((n, k) => n + k.bytes, 0),
  files: Object.values(kinds).reduce((n, k) => n + k.files, 0),
});
await page.route('**/api/telegram/storage-usage', (route) =>
  fulfil(route, {
    ok: true,
    total: totalOf(),
    kinds,
    chats: [{ chat: GROUP, bytes: 2 * 1024 * MB, files: 4 }],
    limits,
  })
);
await page.route('**/api/telegram/storage-clear', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['clear', body]);
  const empty = { bytes: 0, files: 0 };
  kinds = body.all
    ? Object.fromEntries(Object.keys(kinds).map((k) => [k, empty]))
    : { ...kinds, [body.kind]: empty };
  return fulfil(route, { ok: true, removed: { bytes: 1, files: 1 } });
});
await page.route('**/api/telegram/storage-limits-set', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['limits', body]);
  limits = body;
  return fulfil(route, { ok: true, ...body, removed: { bytes: 0, files: 0 } });
});

// The notification settings, and what a reset does to them.
let scopes = {
  users: { on: false, previews: true, stories: true },
  chats: { on: false, previews: true, stories: true },
  broadcasts: { on: false, previews: true, stories: true },
};
let notifyReads = 0;
await page.route('**/api/telegram/notify-settings', (route) => {
  notifyReads += 1;
  return fulfil(route, { ok: true, scopes, exceptions: [] });
});
let reactions = {
  messages: 'contacts',
  stories: 'nobody',
  previews: true,
  sound: true,
};
await page.route('**/api/telegram/reaction-notify', (route) =>
  fulfil(route, { ok: true, ...reactions })
);
await page.route('**/api/telegram/reaction-notify-set', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['reactions', body]);
  reactions = { ...reactions, ...body };
  return fulfil(route, { ok: true, ...reactions });
});
await page.route('**/api/telegram/notify-reset', (route) => {
  calls.push(['reset', null]);
  const on = { on: true, previews: true, stories: true };
  scopes = { users: on, chats: on, broadcasts: on };
  reactions = {
    messages: 'nobody',
    stories: 'nobody',
    previews: true,
    sound: true,
  };
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/auto-download-preset', (route) => {
  calls.push(['preset', null]);
  return fulfil(route, {
    ok: true,
    medium: {
      disabled: false,
      photoMax: MB,
      videoMax: 30 * MB,
      fileMax: 3 * MB,
    },
  });
});

const checked = (action) =>
  page.locator(`[data-action="${action}"]`).isChecked();
const callCount = () => calls.length;

const notify = page.locator('.telegram-notify');

const storageSteps = async () => {
  // --- Manage local storage ------------------------------------------------
  const section = page.locator('.storage-settings');
  await section.waitFor({ timeout: 15000 });
  await section.locator('[data-action="storage-open"]').click();
  const panel = section.locator('[data-storage="panel"]');
  await panel.waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('.storage-row').count()) === 6,
    'six kinds of media'
  );
  const photos = await panel
    .locator('[data-storage-size="photos"]')
    .textContent();
  assert(photos.includes('3.0 MB') && photos.includes('12 files'), photos);
  const videos = await panel
    .locator('[data-storage-size="videos"]')
    .textContent();
  assert(videos.includes('2.0 GB'), videos);
  assert(
    await panel.locator('[data-action="storage-clear-voice"]').isDisabled(),
    'an empty kind cannot be cleared'
  );
  assert(
    (await panel.locator('[data-storage-chat]').count()) === 1,
    'the chat that takes room'
  );

  // Clear one kind: posted at once, the list follows.
  await panel.locator('[data-action="storage-clear-photos"]').click();
  await until(async () => callCount() === 1, 'the kind clear is posted');
  assert(
    JSON.stringify(calls[0]) === JSON.stringify(['clear', { kind: 'photos' }]),
    `posted: ${JSON.stringify(calls[0])}`
  );
  await until(
    async () =>
      await panel.locator('[data-action="storage-clear-photos"]').isDisabled(),
    'photos shown empty'
  );

  // The limits post their choice.
  await panel.locator('[data-action="storage-max"]').selectOption('5');
  await until(async () => callCount() === 2, 'the size limit is posted');
  assert(
    JSON.stringify(calls[1]) ===
      JSON.stringify(['limits', { maxGb: 5, olderDays: 0 }]),
    `limits: ${JSON.stringify(calls[1])}`
  );
  await panel.locator('[data-action="storage-older"]').selectOption('30');
  await until(async () => callCount() === 3, 'the age limit is posted');
  assert(
    JSON.stringify(calls[2]) ===
      JSON.stringify(['limits', { maxGb: 5, olderDays: 30 }]),
    `limits: ${JSON.stringify(calls[2])}`
  );

  // Clear all asks first; Escape closes only the question.
  await panel.locator('[data-action="storage-clear-all"]').click();
  const ask = page.locator('[data-dialog="storage-clear-all"]');
  await ask.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await ask.waitFor({ state: 'detached', timeout: 5000 });
  assert(callCount() === 3, 'nothing posted by Escape');
  assert(await panel.isVisible(), 'the panel stays');
  await panel.locator('[data-action="storage-clear-all"]').click();
  await ask.waitFor({ timeout: 5000 });
  await ask.locator('[data-action="storage-clear-all-yes"]').click();
  await until(async () => callCount() === 4, 'clear all is posted');
  assert(
    JSON.stringify(calls[3]) === JSON.stringify(['clear', { all: true }]),
    `clear all: ${JSON.stringify(calls[3])}`
  );
  await until(
    async () =>
      (await panel.locator('[data-storage-total]').textContent()).includes(
        '0 B'
      ),
    'everything shown cleared'
  );
};

const reactionSteps = async () => {
  // --- Reactions -----------------------------------------------------------
  await notify.waitFor({ timeout: 15000 });
  const reactionsBox = notify.locator('[data-scope="reactions"]');
  await reactionsBox.waitFor({ timeout: 5000 });
  assert(
    (await reactionsBox.locator('h4').textContent()) === 'Reactions',
    'a Reactions section'
  );
  assert(
    (await reactionsBox
      .locator('[data-action="reactions-messages"]')
      .inputValue()) === 'contacts',
    'messages from contacts'
  );
  await reactionsBox
    .locator('[data-action="reactions-stories"]')
    .selectOption('all');
  await until(async () => callCount() === 5, 'the stories choice is posted');
  assert(
    JSON.stringify(calls[4]) ===
      JSON.stringify(['reactions', { stories: 'all' }]),
    `reactions: ${JSON.stringify(calls[4])}`
  );
  await reactionsBox.locator('[data-action="reactions-sound"]').uncheck();
  await until(async () => callCount() === 6, 'the sound is posted');
  assert(calls[5][1].sound === false, `sound: ${JSON.stringify(calls[5])}`);
};

const resetSteps = async () => {
  // --- Reset all notifications ---------------------------------------------
  assert(!(await checked('notify-users')), 'private off before the reset');
  await notify.locator('[data-action="notify-reset-all"]').click();
  const resetAsk = page.locator('[data-dialog="notify-reset-all"]');
  await resetAsk.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await resetAsk.waitFor({ state: 'detached', timeout: 5000 });
  assert(callCount() === 6, 'nothing posted by Escape');
  const reads = notifyReads;
  await notify.locator('[data-action="notify-reset-all"]').click();
  await resetAsk.waitFor({ timeout: 5000 });
  await resetAsk.locator('[data-action="notify-reset-all-yes"]').click();
  await until(async () => callCount() === 7, 'the reset is posted');
  await until(async () => notifyReads > reads, 'the settings are loaded again');
  await until(
    async () => await checked('notify-users'),
    'shown on after reset'
  );
  await until(
    async () =>
      (await notify
        .locator('[data-action="reactions-messages"]')
        .inputValue()) === 'nobody',
    'reactions loaded again'
  );
};

const presetSteps = async () => {
  // --- Automatic download: Reset to default --------------------------------
  const media = page.locator('.media-settings');
  await media.locator('[data-action="auto-photos-users"]').uncheck();
  assert(!(await checked('auto-photos-users')), 'photos turned off');
  await media.locator('[data-action="auto-download-reset"]').click();
  await until(async () => callCount() === 8, 'the preset is asked');
  await until(
    async () => await checked('auto-photos-users'),
    'photos back on from the preset'
  );
  assert(
    (await media.locator('[data-action="auto-video-chats"]').inputValue()) ===
      '30',
    'videos up to the medium preset'
  );
};

await finish(async () => {
  await page.goto(base);
  await page.locator('button[data-view="settings"]').click();
  await storageSteps();
  await reactionSteps();
  await resetSteps();
  await presetSteps();
});
