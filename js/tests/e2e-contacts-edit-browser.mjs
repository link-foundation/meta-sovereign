// Real browser e2e for close friends and adding a contact by phone
// (R-Y169), as Telegram Desktop has them: Privacy and security has a
// Close friends editor (the contacts with checks, the current close
// friends checked; Save sends exactly the checked ids). The list's "+"
// offers Add contact (first name, last name, phone): a number that is on
// Telegram adds the contact and offers to open its chat, one that is not
// says so in words. Telegram's answers faked in the page, a fake chat in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:contacts-edit

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const { base, page, until, finish } = await openChatApp('contacts-edit', {
  store,
});

await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: '',
    about: '',
    username: 'ann',
    phone: '',
    hasPhoto: false,
    aboutMax: 70,
  })
);
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, { ok: true, ttlDays: 0, sessions: [] })
);
await page.route('**/api/telegram/blocked', (route) =>
  fulfil(route, { ok: true, count: 0, items: [], next: null })
);
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/close-friends', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      { id: '4', name: 'Alice Ant', username: 'alice', closeFriend: true },
      { id: '5', name: 'Bob Bee', username: null, closeFriend: false },
      { id: '6', name: 'Carol Cat', username: null, closeFriend: true },
      { id: '8', name: 'Dan Dove', username: null, closeFriend: false },
    ],
  })
);
const saved = [];
await page.route('**/api/telegram/close-friends-set', (route) => {
  saved.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, count: saved.at(-1).ids.length });
});
const imports = [];
await page.route('**/api/telegram/contact-import', (route) => {
  const body = route.request().postDataJSON();
  imports.push(body);
  return fulfil(
    route,
    body.phone.replace(/\s/g, '') === '+15551234567'
      ? {
          ok: true,
          found: true,
          contact: { id: '77', name: 'Ann Lee', username: null },
          chat: '77',
        }
      : { ok: true, found: false }
  );
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const hash = () => page.evaluate(() => globalThis.location.hash);

const closeFriendsSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await page.locator('[data-action="open-close-friends"]').click();
  const dialog = page.locator('[data-dialog="close-friends"]');
  await dialog.locator('[data-contact="4"]').waitFor({ timeout: 5000 });
  const checked = async (id) =>
    dialog.locator(`[data-contact="${id}"]`).isChecked();
  assert(
    (await checked('4')) && (await checked('6')),
    'the current close friends are checked'
  );
  assert(!(await checked('5')) && !(await checked('8')), 'others unchecked');
  await dialog.locator('[data-contact="4"]').uncheck();
  await dialog.locator('[data-contact="8"]').check();
  assert(saved.length === 0, 'nothing sent before Save');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[data-saved]').waitFor({ timeout: 5000 });
  assert(saved.length === 1, 'saved once');
  assert(
    JSON.stringify([...saved[0].ids].sort()) === '["6","8"]',
    `exact ids: ${JSON.stringify(saved[0])}`
  );
  // Escape closes only the editor; the privacy dialog stays.
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes Close friends');
  assert(
    (await page.locator('[data-dialog="privacy"]').count()) === 1,
    'Privacy and security stays'
  );
  await page.keyboard.press('Escape');
  await gone(page.locator('[data-dialog="privacy"]'), 'then privacy closes');
  await page.keyboard.press('Escape');
  await gone(page.locator('[data-dialog="my-profile"]'), 'then the profile');
};

const addContactSteps = async () => {
  const dialog = page.locator('[data-dialog="add-contact"]');
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="new-contact"]').click();
  await dialog.waitFor();
  // A number without a + is refused in the page.
  await dialog.locator('[data-field="firstName"]').fill('Ann');
  await dialog.locator('[data-field="phone"]').fill('5550000');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert(
    (await dialog.textContent()).includes('country code'),
    'the + is asked for'
  );
  assert(imports.length === 0, 'nothing sent for a bad number');
  // A number that is not on Telegram says so.
  await dialog.locator('[data-field="phone"]').fill('+15550000000');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[data-result="not-found"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.textContent()).includes('not on Telegram'),
    'says it is not on Telegram'
  );
  // A number that is on Telegram adds the contact.
  await dialog.locator('[data-field="lastName"]').fill('Lee');
  await dialog.locator('[data-field="phone"]').fill('+1 555 123 4567');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[data-result="added"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(imports.at(-1)) ===
      '{"firstName":"Ann","lastName":"Lee","phone":"+1 555 123 4567"}',
    `import body: ${JSON.stringify(imports.at(-1))}`
  );
  assert((await dialog.textContent()).includes('Ann Lee'), 'the new contact');
  await dialog.locator('[data-action="open-contact-chat"]').click();
  await gone(dialog, 'the dialog closes');
  await until(async () => (await hash()) === '#chat=telegram:77', 'chat opens');
};

await finish(async () => {
  await closeFriendsSteps();
  await addContactSteps();
});
