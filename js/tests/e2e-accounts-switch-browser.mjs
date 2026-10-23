// Real browser e2e for using a second Telegram account (R-Y202), as
// Telegram Desktop does: choosing the account in the Accounts window
// switches the whole chat app to it (its chats, its messages, a send goes
// to its route), the account in use is always shown, switching back shows
// account 1 again, and a new message of the other account raises a
// notification that names the account and, clicked, switches to it and
// opens the chat. A real server with two fake accounts, each on its own
// memory store; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:accounts-switch

import { createMemoryStore } from '../src/storage/universal.js';
import { saveExtraAccount } from '../src/sources/telegram-accounts.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '11';
const BOSS = '501';
const old = () => new Date(Date.now() - 60_000).toISOString();

// Account 1: Ann Lee.
const one = createMemoryStore();
await one.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'hello from account one',
  timestamp: old(),
  raw: { id: 1 },
});
// Account 2 is signed in (its session under @2 in account 1's store) and
// has its own store: Boss.
await saveExtraAccount(one, 2, {
  apiId: 2,
  apiHash: 'h',
  session: 'S2',
  account: { id: 88, firstName: 'Work', lastName: 'Account', username: 'work' },
});
const two = createMemoryStore();
await two.put({
  id: `msg:telegram:${BOSS}:1`,
  source: 'telegram',
  chat: BOSS,
  chatName: 'Boss',
  chatType: 'private',
  sender: BOSS,
  senderName: 'Boss',
  body: 'report please',
  timestamp: old(),
  raw: { id: 1 },
});
await two.put({
  id: `read:telegram:${BOSS}`,
  source: 'telegram',
  chat: BOSS,
  unreadCount: 0,
});

// Any other call of a fake account answers "not available here".
const fakeAccount = (who, extra = {}) =>
  new Proxy(
    {
      who,
      status: async () => ({ connected: true, kind: 'user', who }),
      stop: async () => {},
      connected: async () => {},
      live: {},
      ...extra,
    },
    {
      get: (target, key) =>
        key in target
          ? target[key]
          : typeof key === 'string' && key !== 'then'
            ? async () => ({ ok: false, error: 'not available in this test' })
            : undefined,
    }
  );

const sends = [];
const { base, page, until, finish } = await openChatApp('accounts-switch', {
  store: one,
  telegramAccount: fakeAccount('one', {
    accountMe: async () => ({
      ok: true,
      id: '99',
      name: 'Me Myself',
      premium: false,
    }),
  }),
  send: async (draft) => {
    sends.push(['one', draft.chat, draft.text]);
    return { via: 'fake-one' };
  },
  serverOptions: {
    telegramExtraStore: async () => ({ store: two, dir: null }),
    telegramExtraBuild: ({ slot }) => ({
      account: fakeAccount(`two-${slot}`),
      send: async (draft) => {
        sends.push(['two', draft.chat, draft.text]);
        return { via: 'fake-two' };
      },
      setTyping: async () => ({ supported: false }),
    }),
  },
});

// Notifications: allowed, recorded, and clickable from the test.
await page.addInitScript(() => {
  window.__notes = [];
  window.Notification = class {
    static permission = 'granted';
    constructor(title, options) {
      this.title = title;
      this.options = options;
      window.__notes.push(this);
    }
    close() {}
  };
});

// What the chat asks of Telegram itself is answered in the page; the
// account in each request is recorded.
const asked = [];
const quiet = (pattern, body) =>
  page.route(pattern, (route) => {
    asked.push(route.request().url());
    return fulfil(route, body);
  });
await quiet('**/api/telegram/history*', {
  written: 0,
  cached: 0,
  complete: true,
});
await quiet('**/api/telegram/scheduled*', { ok: true, links: [] });
await quiet('**/api/telegram/chat-info*', { chat: '0', kind: 'user' });

const accountsOpen = async () => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-accounts"]').click();
  await page
    .locator('[data-dialog="accounts"] .account-row')
    .first()
    .waitFor({ timeout: 8000 });
};
// The chat list; empty while the page is reloading on another account.
const chats = () =>
  page
    .locator('[data-chat]')
    .evaluateAll((l) => l.map((n) => n.getAttribute('data-chat')))
    .catch(() => []);
const shown = async (expected, what) =>
  until(async () => (await chats()).join() === expected, what);

await finish(async () => {
  await page.goto(`${base}/`);
  await shown(`telegram:${ANN}`, 'account 1 chats');
  // Nothing says "extra account" while account 1 is on screen.
  await page.locator('[data-active-account="1"]').waitFor({ timeout: 8000 });

  // Switch to account 2 in the Accounts window: the whole app reloads on it.
  await accountsOpen();
  await page
    .locator('[data-account="2"] [data-action="switch-account"]')
    .click();
  await shown(`telegram:${BOSS}`, 'account 2 chats');
  assert(
    (await page.locator(`[data-chat="telegram:${ANN}"]`).count()) === 0,
    'account 1 chat is not mixed in'
  );
  const chip = page.locator('[data-active-account="2"]');
  await chip.waitFor({ timeout: 8000 });
  assert(
    (await chip.textContent()).includes('Work Account'),
    'the account in use is named'
  );

  // Its messages, and an answer that goes to its own route.
  await page.locator(`[data-chat="telegram:${BOSS}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.getByText('report please').first().waitFor({ timeout: 8000 });
  await page.locator('.chat-composer textarea').fill('on it');
  await page.locator('.chat-composer button.send').click();
  await until(
    async () =>
      sends.some(([who, , text]) => who === 'two' && text === 'on it'),
    'the answer goes to account 2'
  );
  assert(!sends.some(([who]) => who === 'one'), 'nothing went to account 1');
  assert(
    asked.some((url) => url.includes('telegramAccount=2')),
    'Telegram calls name the account'
  );
  assert(
    (await two.query((l) => l.body === 'on it')).length === 1,
    'its store'
  );
  assert((await one.query((l) => l.body === 'on it')).length === 0, 'not 1');
  // Its page data lives in its own browser copy, apart from account 1's.
  const databases = await page.evaluate(async () =>
    typeof globalThis.indexedDB.databases === 'function'
      ? (await globalThis.indexedDB.databases()).map((d) => d.name)
      : null
  );
  assert(
    databases === null || databases.includes('meta-sovereign@telegram-2'),
    'its own browser store'
  );

  // Back to account 1: its chats and messages only.
  await accountsOpen();
  await page.locator('[data-account="1"] [data-action="open-account"]').click();
  await shown(`telegram:${ANN}`, 'account 1 chats again');
  await page.locator('[data-active-account="1"]').waitFor({ timeout: 8000 });
  await page.locator(`[data-chat="telegram:${ANN}"]`).click();
  await page.getByText('hello from account one').first().waitFor({
    timeout: 8000,
  });
  assert((await page.getByText('report please').count()) === 0, 'no mixing');
  asked.length = 0;

  // A new message of account 2 while account 1 is shown: the badge counts
  // it and the notification names the account.
  await two.put({
    id: `read:telegram:${BOSS}`,
    source: 'telegram',
    chat: BOSS,
    unreadCount: 3,
  });
  await two.put({
    id: `msg:telegram:${BOSS}:2`,
    source: 'telegram',
    chat: BOSS,
    chatName: 'Boss',
    chatType: 'private',
    sender: BOSS,
    senderName: 'Boss',
    body: 'urgent: call me',
    timestamp: new Date().toISOString(),
    raw: { id: 2 },
  });
  await until(
    async () => (await page.evaluate(() => window.__notes.length)) > 0,
    'a notification for the other account'
  );
  const note = await page.evaluate(() => ({
    title: window.__notes[0].title,
    body: window.__notes[0].options.body,
  }));
  assert(
    note.title.includes('Boss') && note.title.includes('Work Account'),
    `labelled with the account: ${note.title}`
  );
  assert(note.body.includes('urgent: call me'), 'the text');
  await page
    .locator('[data-others-unread="3"]')
    .first()
    .waitFor({ timeout: 8000 });

  // Clicking it switches to account 2 and opens that chat.
  await page.evaluate(() => window.__notes[0].onclick());
  await shown(`telegram:${BOSS}`, 'switched by the notification');
  await page.getByText('urgent: call me').first().waitFor({ timeout: 10000 });
});
