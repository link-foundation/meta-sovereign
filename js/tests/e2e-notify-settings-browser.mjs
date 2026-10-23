// Real browser e2e for the notification settings (R-Y157), as Telegram
// Desktop has them: Settings → Notifications lists Private chats, Groups
// and Channels, each with Notifications, Message preview and Stories
// notifications as Telegram has them and its Exceptions (two chats with
// their state); turning Groups off posts that change; a click on an
// exception opens that chat's own settings, whose "Reset to default"
// posts empty settings; the chat's header has the same dialog. Telegram's
// answers faked in the page, a fake chat in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:notify-settings

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

const { base, page, until, finish } = await openChatApp('notify-settings', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

const scopes = {
  users: { on: true, previews: true, stories: true },
  chats: { on: true, previews: false, stories: true },
  broadcasts: { on: false, previews: true, stories: false },
};
const exceptions = [
  {
    chat: GROUP,
    name: 'Fake Group',
    scope: 'chats',
    state: 'unmuted',
    muteUntil: 0,
    forever: false,
    previews: null,
  },
  {
    chat: '-1009',
    name: 'Fake News',
    scope: 'broadcasts',
    state: 'muted',
    muteUntil: 0,
    forever: true,
    previews: false,
  },
];
const calls = [];
await page.route('**/api/telegram/notify-settings', (route) =>
  fulfil(route, { ok: true, scopes, exceptions })
);
await page.route('**/api/telegram/notify-settings-set', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['scope', body]);
  const { scope, ...change } = body;
  return fulfil(route, { ok: true, scope, ...scopes[scope], ...change });
});
await page.route('**/api/telegram/notify-chat', (route) =>
  fulfil(route, {
    ok: true,
    chat: route.request().postDataJSON().chat,
    exception: true,
    muteUntil: 0,
    forever: false,
    previews: null,
    stories: true,
  })
);
await page.route('**/api/telegram/notify-chat-set', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['chat', body]);
  return fulfil(route, {
    ok: true,
    chat: body.chat,
    exception: !body.reset,
    muteUntil: 0,
    forever: false,
    previews: body.previews ? body.previews === 'on' : null,
    stories: true,
  });
});

const checked = (action) =>
  page.locator(`[data-action="${action}"]`).isChecked();

await finish(async () => {
  await page.goto(base);
  await page.locator('button[data-view="settings"]').click();
  const section = page.locator('.telegram-notify');
  await section.waitFor({ timeout: 15000 });

  // The sections, with Telegram's values.
  assert((await section.locator('.notify-scope').count()) === 3, 'three');
  const heads = await section.locator('h4').allTextContents();
  assert(
    heads.join('|') === 'Private chats|Groups|Channels',
    `heads: ${heads}`
  );
  assert(await checked('notify-users'), 'private on');
  assert(!(await checked('notify-broadcasts')), 'channels off');
  assert(!(await checked('notify-preview-chats')), 'group previews off');
  assert(await checked('notify-preview-users'), 'private previews on');
  assert(!(await checked('notify-stories-broadcasts')), 'channel stories off');
  assert(await checked('notify-stories-chats'), 'group stories on');
  assert(
    (await page
      .locator('[data-action="notify-exceptions-chats"]')
      .textContent()) === 'Exceptions: 1',
    'a group exception'
  );

  // Groups off: the change is posted.
  await page.locator('[data-action="notify-chats"]').uncheck();
  await until(async () => calls.length === 1, 'the change is posted');
  assert(
    JSON.stringify(calls[0]) ===
      JSON.stringify(['scope', { scope: 'chats', on: false }]),
    `posted: ${JSON.stringify(calls[0])}`
  );
  await until(async () => !(await checked('notify-chats')), 'shown off');

  // The exceptions: two chats in all, each with its state.
  await page.locator('[data-action="notify-exceptions-chats"]').click();
  await page.locator('[data-action="notify-exceptions-broadcasts"]').click();
  const rows = page.locator('.notify-exception');
  assert((await rows.count()) === 2, 'two exceptions');
  const texts = await rows.allTextContents();
  assert(
    texts[0].includes('Fake Group') && texts[0].includes('Unmuted'),
    texts[0]
  );
  assert(
    texts[1].includes('Fake News') && texts[1].includes('Muted'),
    texts[1]
  );

  // A click opens that chat's own settings; Reset posts empty settings.
  await page.locator('[data-exception="-1005"]').click();
  const dialog = page.locator('[data-dialog="chat-notify"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-follows="false"]').waitFor();
  await dialog.locator('[data-action="notify-reset"]').click();
  await until(async () => calls.length === 2, 'the reset is posted');
  assert(
    JSON.stringify(calls[1]) ===
      JSON.stringify(['chat', { chat: GROUP, reset: true }]),
    `reset: ${JSON.stringify(calls[1])}`
  );
  await dialog.locator('[data-follows="true"]').waitFor();
  await dialog.locator('[data-action="notify-close"]').click();
  await until(
    async () => (await page.locator('.notify-exception').count()) === 1,
    'the list loses the reset chat'
  );

  // The chat's own header has the dialog: mute for 8 hours, preview off.
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator('[data-action="chat-notify"]').click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="notify-mute8h"]').click();
  await until(async () => calls.length === 3, 'mute posted');
  assert(
    JSON.stringify(calls[2]) ===
      JSON.stringify(['chat', { chat: GROUP, mute: 28800 }]),
    `mute: ${JSON.stringify(calls[2])}`
  );
  await dialog.locator('[data-choice="notify-preview-off"]').click();
  await until(async () => calls.length === 4, 'preview posted');
  assert(
    calls[3][1].previews === 'off',
    `preview: ${JSON.stringify(calls[3])}`
  );
});
