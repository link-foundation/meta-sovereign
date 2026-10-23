// Real browser e2e for notifications of new messages (R-Y134), as
// Telegram Desktop gives them: a message that comes in (through the
// server's event stream) to a chat that is not open shows a notification
// with the chat's name, the sender and the text; one to the open chat
// does not; a click on it opens the chat; the page's title counts what is
// unread; Settings turns them off and hides the text; another section
// notifies too, and its click comes back to the chat (R-Y144). The browser's
// Notification faked in the page, fake chats in a memory store, a server
// on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:notify

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '222';
const BOB = '333';
const CLUB = '-1004440';
const store = createMemoryStore();
const message = (chat, name, n, body, ago = 0, type = 'user') => ({
  id: `msg:telegram:${chat}:${n}`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: type,
  sender: chat,
  senderName: name,
  body,
  timestamp: new Date(Date.now() - ago).toISOString(),
  raw: { id: n },
});
for (const [chat, name] of [
  [ANN, 'Fake Ann'],
  [BOB, 'Fake Bob'],
  [CLUB, 'Fake Club'],
]) {
  const type = chat === CLUB ? 'supergroup' : 'user';
  await store.put(
    message(chat, name, 1, `hello from ${name}`, 10 * 60_000, type)
  );
  await store.put({
    id: `read:telegram:${chat}`,
    tokens: ['read', 'telegram', chat],
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: 1,
  });
}

const { base, page, until, finish } = await openChatApp('notify', { store });
// The system's notifications recorded; the page counts as looked at.
await page.addInitScript(() => {
  globalThis.__notes = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, options = {}) {
      this.title = title;
      this.body = options.body;
      this.tag = options.tag;
      globalThis.__notes.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  globalThis.Notification = FakeNotification;
  document.hasFocus = () => true;
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
// Telegram's notification settings (R-Y157): groups off, the rest on.
const scopes = {
  users: { on: true, previews: true, stories: true },
  chats: { on: false, previews: true, stories: true },
  broadcasts: { on: true, previews: true, stories: true },
};
await page.route('**/api/telegram/notify-settings', (route) =>
  fulfil(route, { ok: true, scopes, exceptions: [] })
);
await page.route('**/api/telegram/notify-settings-set', (route) => {
  const { scope, ...change } = route.request().postDataJSON();
  Object.assign(scopes[scope], change);
  return fulfil(route, { ok: true, scope, ...scopes[scope] });
});

const notes = () =>
  page.evaluate(() =>
    globalThis.__notes.map(({ title, body, tag }) => ({ title, body, tag }))
  );
const hash = () => page.evaluate(() => globalThis.location.hash);

const telegramRules = async () => {
  // Telegram's settings (R-Y157): Groups are off, so a new group message
  // raises no notification while a private one still does.
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="notify"]').check();
  await page.locator('[data-action="notify-preview"]').check();
  await page.locator('[data-action="notify-chats"]').waitFor({ timeout: 5000 });
  assert(
    !(await page.locator('[data-action="notify-chats"]').isChecked()),
    'groups are off in Settings'
  );
  await page.locator('button[data-view="chat"]').click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const before = (await notes()).length;
  await store.put(message(CLUB, 'Fake Club', 2, 'group news', 0, 'supergroup'));
  await page.waitForTimeout(800);
  assert((await notes()).length === before, 'a group is not notified');
  await store.put(message(BOB, 'Fake Bob', 5, 'private news'));
  await until(async () => (await notes()).length === before + 1, 'private');
  const private1 = (await notes()).at(-1);
  assert(
    private1.title === 'Fake Bob' && private1.body === 'private news',
    `private: ${JSON.stringify(private1)}`
  );

  // With previews off for private chats the text reads "New message".
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="notify-preview-users"]').uncheck();
  await page.waitForTimeout(800);
  await store.put(message(ANN, 'Fake Ann', 4, 'a secret'));
  await until(async () => (await notes()).length === before + 2, 'hidden');
  const hidden = (await notes()).at(-1);
  assert(
    hidden.title === 'meta-sovereign' && hidden.body === 'New message',
    `previews off: ${JSON.stringify(hidden)}`
  );
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:${ANN}`);
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator(`[data-chat="telegram:${BOB}"]`).waitFor();
  assert((await notes()).length === 0, 'nothing on the first look');

  // A message to Bob's chat, not open: a notification.
  await store.put(message(BOB, 'Fake Bob', 2, 'are you there?'));
  await until(async () => (await notes()).length === 1, 'notified');
  const [first] = await notes();
  assert(first.title === 'Fake Bob', `title: ${first.title}`);
  assert(first.body === 'are you there?', `body: ${first.body}`);
  assert(first.tag === `telegram:${BOB}`, `tag: ${first.tag}`);
  await until(
    async () => /^\(\d+\) /.test(await page.title()),
    'the title counts unread'
  );

  // A message to the open chat: none.
  await store.put(message(ANN, 'Fake Ann', 2, 'in the open chat'));
  await page
    .locator(`[data-message="msg:telegram:${ANN}:2"]`)
    .waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  assert((await notes()).length === 1, 'the open chat is not notified');

  // A click on the notification opens Bob's chat.
  await page.evaluate(() => globalThis.__notes[0].onclick());
  await until(
    async () => (await hash()) === `#chat=telegram:${BOB}`,
    'the chat opens'
  );

  // Settings: the text hidden, then notifications off.
  await page.locator('button[data-view="settings"]').click();
  const preview = page.locator('[data-action="notify-preview"]');
  await preview.waitFor({ timeout: 5000 });
  assert(
    (await page.locator('[data-permission="granted"]').count()) === 1,
    'the browser allows them'
  );
  await preview.uncheck();
  // In another section the app still notifies (R-Y144): the text hidden.
  await page.waitForTimeout(1000);
  await store.put(message(ANN, 'Fake Ann', 3, 'a secret'));
  await until(async () => (await notes()).length === 2, 'notified again');
  const second = (await notes())[1];
  assert(
    second.title === 'meta-sovereign' && second.body === 'New message',
    `hidden: ${JSON.stringify(second)}`
  );
  await until(
    async () => /^\(\d+\) /.test(await page.title()),
    'the title counts unread in Settings'
  );
  // Its click brings the Chat section with that chat, and coming back
  // notifies nothing old.
  await page.evaluate(() => globalThis.__notes[1].onclick());
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await until(
    async () => (await hash()) === `#chat=telegram:${ANN}`,
    'the chat opens from Settings'
  );
  await page.waitForTimeout(800);
  assert((await notes()).length === 2, 'nothing old on coming back');
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="notify"]').uncheck();
  await store.put(message(BOB, 'Fake Bob', 3, 'once more'));
  await page.waitForTimeout(800);
  assert((await notes()).length === 2, 'off in Settings: none');
  await page.locator('button[data-view="chat"]').click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await store.put(message(BOB, 'Fake Bob', 4, 'and again'));
  await page.waitForTimeout(800);
  assert((await notes()).length === 2, `off: ${JSON.stringify(await notes())}`);
  await telegramRules();
});
