// Real browser e2e for the Contacts window and read times in private chats
// (R-Y189), as Telegram Desktop has them: the list's menu has Contacts, a
// window with every contact's avatar, name and status ("online", "last
// seen …"), sorted by last seen (online first) or by name, searched by
// name, username or phone; a click opens that contact's chat. In a private
// chat the menu of one's own message says "Read at HH:MM" (asked once per
// message), "Read" with "Hidden by privacy" when Telegram refuses for
// privacy, and nothing for a message not read yet. Telegram's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:contacts

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '11';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const message = (n, sender, body) => ({
  id: `msg:telegram:${ANN}:${n}`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender,
  senderName: sender === 'me' ? 'You' : 'Ann Lee',
  body,
  timestamp: at(n),
  raw: { id: n },
});
await store.put(message(1, ANN, 'hello from Ann'));
await store.put(message(2, 'me', 'read and shown'));
await store.put(message(3, 'me', 'read but hidden'));
await store.put(message(4, 'me', 'not read yet'));

const { base, page, until, finish } = await openChatApp('contacts', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: ANN, kind: 'user', title: 'Ann Lee', online: false })
);
const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      {
        id: '11',
        name: 'Ann Lee',
        username: 'ann',
        phone: '15550001',
        online: false,
        lastSeen: hourAgo,
      },
      {
        id: '12',
        name: 'Bob Ray',
        username: null,
        phone: '15550002',
        online: true,
      },
      {
        id: '13',
        name: 'Cid Fox',
        username: 'cidf',
        phone: null,
        online: false,
        lastSeen: 'week',
      },
      {
        id: '14',
        name: 'Dee Oak',
        username: null,
        phone: '15550004',
        online: false,
        lastSeen: 'recently',
      },
    ],
  })
);
const readAsked = [];
await page.route('**/api/telegram/message-read-time', (route) => {
  const body = route.request().postDataJSON();
  readAsked.push(body.id);
  if (body.id === 2) {
    return fulfil(route, { ok: true, read: true, date: Date.now() - 600_000 });
  }
  if (body.id === 3) {
    return fulfil(route, {
      ok: true,
      read: true,
      date: null,
      code: 'peer-privacy',
    });
  }
  return fulfil(route, { ok: true, read: false });
});

const win = page.locator('[data-dialog="contacts"]');
const names = () =>
  win
    .locator('.contact-row .member-name')
    .evaluateAll((l) => l.map((n) => n.textContent));
const row = (n) =>
  page.locator(`.chat-scroll [data-message="msg:telegram:${ANN}:${n}"]`);
const menuOn = async (n) => {
  await row(n)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
};
const readLine = page.locator('.msg-context-menu [data-read-time]');

const contactsSteps = async () => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-contacts"]').click();
  await win.locator('.contact-row').first().waitFor({ timeout: 5000 });
  // Last seen: online first, then the latest, "recently" before "week".
  assert(
    (await names()).join() === 'Bob Ray,Ann Lee,Dee Oak,Cid Fox',
    `seen: ${await names()}`
  );
  const status = await win
    .locator('[data-contact="12"] .contact-status')
    .textContent();
  assert(status === 'online', `online: ${status}`);
  const week = await win
    .locator('[data-contact="13"] .contact-status')
    .textContent();
  assert(week === 'last seen within a week', `week: ${week}`);
  // By name.
  await win.locator('[data-action="contacts-sort"]').click();
  assert(
    (await names()).join() === 'Ann Lee,Bob Ray,Cid Fox,Dee Oak',
    `name: ${await names()}`
  );
  assert(
    (await win
      .locator('[data-action="contacts-sort"]')
      .getAttribute('data-mode')) === 'name',
    'mode'
  );
  // Search by name, username and phone.
  const search = win.locator('[data-field="contacts-search"]');
  await search.fill('cidf');
  assert((await names()).join() === 'Cid Fox', `username: ${await names()}`);
  await search.fill('0002');
  assert((await names()).join() === 'Bob Ray', `phone: ${await names()}`);
  await search.fill('dee');
  assert((await names()).join() === 'Dee Oak', `name: ${await names()}`);
  await search.fill('');
  // A click opens the chat and closes the window.
  await win.locator('[data-contact="11"] [data-action="open-contact"]').click();
  await until(async () => (await win.count()) === 0, 'the window closes');
  const hash = await page.evaluate(() => globalThis.location.hash);
  assert(hash === `#chat=telegram:${ANN}`, `hash: ${hash}`);
  await row(1).waitFor({ timeout: 10000 });
};

const readSteps = async () => {
  // Someone else's message: no line. Read: the time.
  await menuOn(1);
  assert((await readLine.count()) === 0, 'no read time on hers');
  await page.keyboard.press('Escape');
  await menuOn(2);
  await readLine.waitFor({ timeout: 5000 });
  const text = await readLine.textContent();
  assert(/^Read at \d/.test(text) || /^Read at /.test(text), `read: ${text}`);
  await page.keyboard.press('Escape');
  // Asked again for the same message: answered from the cache.
  await menuOn(2);
  await readLine.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  assert(
    readAsked.filter((id) => id === 2).length === 1,
    `asked: ${readAsked}`
  );
  // The privacy fallback: "Read", hidden by privacy, no time.
  await menuOn(3);
  await readLine.waitFor({ timeout: 5000 });
  const hidden = await readLine.textContent();
  assert(
    hidden.startsWith('Read') && hidden.includes('Hidden by privacy'),
    `hidden: ${hidden}`
  );
  assert(!/\d:\d/.test(hidden), `no time: ${hidden}`);
  await page.keyboard.press('Escape');
  // Not read yet: nothing.
  await menuOn(4);
  await until(async () => readAsked.includes(4), 'asked for 4');
  await page.waitForTimeout(200);
  assert((await readLine.count()) === 0, 'nothing for an unread message');
  await page.keyboard.press('Escape');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page
    .locator(`[data-chat="telegram:${ANN}"]`)
    .waitFor({ timeout: 15000 });
  await contactsSteps();
  await readSteps();
});
