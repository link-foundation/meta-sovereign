// Real browser e2e for the account switcher (R-Y198), as Telegram
// Desktop's main menu has it: the list's menu has Accounts, a window that
// lists every signed-in account with its name and unread count; choosing
// another account shows that account's chat list; Add account opens the
// sign-in for the next free slot; Log out of an extra account asks first
// and only then removes it. Telegram's answers faked in the page, a fake
// chat in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:accounts

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '11';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'hello from account one',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('accounts', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
let accounts = [
  { account: 1, current: true, id: '99', name: 'Me Myself' },
  { account: 2, name: 'Work Account', username: 'work' },
];
const calls = [];
await page.route('**/api/telegram/accounts', (route) =>
  fulfil(route, {
    ok: true,
    accounts,
    limit: 3,
    premium: false,
    canAdd: accounts.length < 3,
    next: accounts.length < 3 ? 3 : null,
  })
);
await page.route('**/api/telegram/accounts-unread', (route) =>
  fulfil(route, {
    ok: true,
    unread: accounts
      .filter((a) => a.account > 1)
      .map((a) => ({ account: a.account, unread: 5 })),
  })
);
await page.route('**/api/telegram/accounts-dialogs', (route) => {
  calls.push(['dialogs', route.request().postDataJSON().account]);
  return fulfil(route, {
    ok: true,
    unread: 5,
    dialogs: [
      { chat: '501', name: 'Boss', text: 'report please', date: 1, unread: 5 },
      { chat: '502', name: 'Team', text: 'standup', date: 0, unread: 0 },
    ],
  });
});
await page.route('**/api/telegram/accounts-logout', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['logout', body.account]);
  accounts = accounts.filter((a) => a.account !== body.account);
  return fulfil(route, { ok: true, removed: 4 });
});
await page.route('**/api/auto-import/telegram/login/start', (route) => {
  calls.push(['login', route.request().postDataJSON().account]);
  return fulfil(route, { needs: 'code', id: 'fake-login' });
});

const win = page.locator('[data-dialog="accounts"]');
const names = () =>
  win
    .locator('.account-row .member-name')
    .evaluateAll((l) => l.map((n) => n.textContent));
const opened = async () => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-accounts"]').click();
  await win.locator('.account-row').first().waitFor({ timeout: 5000 });
};
const done = (name, account) =>
  calls.some(([n, a]) => n === name && a === account);

const listSteps = async () => {
  await opened();
  // The switcher lists the 2 accounts, the current one first.
  assert((await names()).join() === 'Me Myself,Work Account', `names`);
  assert(
    (await win.locator('[data-account="1"]').getAttribute('data-current')) ===
      'true',
    'account 1 is the current one'
  );
  // The other account's unread count arrives after the list.
  await win
    .locator('[data-account="2"] .account-unread')
    .waitFor({ timeout: 5000 });
  assert(
    (await win.locator('[data-account="2"] .account-unread').textContent()) ===
      '5',
    'unread badge'
  );
  // Account 1 is never logged out here.
  assert(
    (await win
      .locator('[data-account="1"] [data-action="account-logout"]')
      .count()) === 0,
    'no log out for account 1'
  );
};

const switchSteps = async () => {
  // Switching to account 2 changes the chat list.
  await win.locator('[data-account="2"] [data-action="open-account"]').click();
  await win.locator('[data-account-chats="2"]').waitFor({ timeout: 5000 });
  await win.locator('.account-dialog').first().waitFor({ timeout: 5000 });
  const rows = await win
    .locator('.account-dialog .member-name')
    .evaluateAll((l) => l.map((n) => n.textContent));
  assert(rows.join() === 'Boss,Team', `account 2 chats: ${rows}`);
  assert(done('dialogs', 2), 'the chats of account 2 were asked for');
  await win.locator('[data-action="accounts-back"]').click();
  await win.locator('.account-row').first().waitFor({ timeout: 5000 });
};

const addSteps = async () => {
  // Add account opens the sign-in for the next free slot.
  await win.locator('[data-action="account-add"]').click();
  await win.locator('[data-login-account="3"]').waitFor({ timeout: 5000 });
  await win.locator('[data-field="apiId"]').fill('2040');
  await win.locator('[data-field="apiHash"]').fill('abcdef');
  await win.locator('[data-field="phone"]').fill('+15551234567');
  await win.locator('[data-action="telegram-login"]').click();
  await until(async () => done('login', 3), 'the sign-in asks for slot 3');
  await win.locator('[data-field="code"]').waitFor({ timeout: 5000 });
  await win.locator('[data-action="accounts-back"]').click();
  await win.locator('.account-row').first().waitFor({ timeout: 5000 });
};

const logoutSteps = async () => {
  // Logging out the extra account confirms first.
  await win
    .locator('[data-account="2"] [data-action="account-logout"]')
    .click();
  await win.locator('[data-account-logout="2"]').waitFor({ timeout: 5000 });
  assert(!done('logout', 2), 'nothing is removed before confirming');
  await win.locator('[data-action="account-logout-cancel"]').click();
  await win.locator('.account-row').first().waitFor({ timeout: 5000 });
  assert(!done('logout', 2), 'cancel removes nothing');
  assert((await names()).length === 2, 'both accounts are still listed');
  await win
    .locator('[data-account="2"] [data-action="account-logout"]')
    .click();
  await win.locator('[data-action="account-logout-confirm"]').click();
  await until(async () => done('logout', 2), 'logout asked after confirming');
  await until(async () => (await names()).join() === 'Me Myself', 'list');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page
    .locator(`[data-chat="telegram:${ANN}"]`)
    .waitFor({ timeout: 15000 });
  await listSteps();
  await switchSteps();
  await addSteps();
  await logoutSteps();
  // The existing account's chat is untouched by all of it.
  await page.locator('[data-action="close"]').click();
  assert(
    (await page.locator(`[data-chat="telegram:${ANN}"]`).count()) === 1,
    'account 1 chat still listed'
  );
});
