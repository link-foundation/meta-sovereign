// Real browser e2e for the user's own Telegram profile (R-Y136), as
// Telegram Desktop's Settings → My Account has it: a button by the chat
// list's title opens a card with the photo, first and last name, bio with
// the characters left, username with a live check (available, taken) and
// the phone masked until Show. Save sends only what changed; the photo is
// set from a file (uploaded first) and removed; Telegram's refusals show
// as text; Escape and a click outside close the card. Telegram's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:profile

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const FRIEND = 'Some Friend';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: FRIEND, senderName: FRIEND, chatType: 'private' },
  ...{ sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const { base, page, until, finish } = await openChatApp('profile', { store });

await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: 'Hi there',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: true,
    aboutMax: 70,
  })
);
const checks = [];
await page.route('**/api/telegram/username-check', (route) => {
  const { username } = route.request().postDataJSON();
  checks.push(username);
  return fulfil(route, {
    ok: true,
    status: username === 'taken_name' ? 'taken' : 'available',
  });
});
const saved = [];
await page.route('**/api/telegram/profile-save', (route) => {
  const body = route.request().postDataJSON();
  saved.push(['profile', body]);
  return body.lastName === 'Boom'
    ? fulfil(route, { ok: false, error: 'x', code: 'flood' })
    : fulfil(route, { ok: true });
});
await page.route('**/api/telegram/username-save', (route) => {
  saved.push(['username', route.request().postDataJSON()]);
  return fulfil(route, { ok: true });
});
const photos = [];
await page.route('**/api/telegram/profile-photo', (route) => {
  photos.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
let uploads = 0;
await page.route('**/api/telegram/upload*', (route) => {
  uploads += 1;
  return fulfil(route, { ok: true, token: 'tok1', name: 'p.png', size: 4 });
});

const dialog = page.locator('[data-dialog="my-profile"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const field = (name) => dialog.locator(`[data-field="${name}"]`);
const status = () => dialog.locator('[data-username-status]');
const opened = async () => {
  await page.locator('button[data-view="profile"]').click();
  await page.locator('[data-action="my-profile"]').click();
  await field('firstName').waitFor({ timeout: 5000 });
};
const statusIs = (want) =>
  until(
    async () =>
      (await status().count()) === 1 &&
      (await status().getAttribute('data-username-status')) === want,
    `username ${want}`
  );

const openSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await opened();
  assert((await field('firstName').inputValue()) === 'Ann', 'first name');
  assert((await field('lastName').inputValue()) === 'Lee', 'last name');
  assert((await field('about').inputValue()) === 'Hi there', 'bio');
  assert((await field('username').inputValue()) === 'annlee', 'username');
  // The phone is masked until Show.
  const phone = () => field('phone').textContent();
  assert(!(await phone()).includes('5551234'), `masked: ${await phone()}`);
  await dialog.locator('[data-action="show-phone"]').click();
  assert((await phone()) === '+15551234567', 'phone shown');
  await dialog.locator('[data-action="show-phone"]').click();
  assert(!(await phone()).includes('5551234'), 'masked again');
};

const editSteps = async () => {
  await field('firstName').fill('Anna');
  await field('about').fill('Hello');
  const left = await dialog
    .locator('[data-about-left]')
    .getAttribute('data-about-left');
  assert(left === '65', `characters left: ${left}`);
  // The live check: taken, then available; the same name asks nothing.
  await field('username').fill('taken_name');
  await statusIs('taken');
  assert(
    (await status().textContent()).includes('already taken'),
    'taken text'
  );
  await field('username').fill('free_name');
  await statusIs('available');
  await field('username').fill('ab');
  await statusIs('invalid');
  assert(!checks.includes('ab'), 'an invalid name is not asked');
  await field('username').fill('free_name');
  await statusIs('available');
  // A refusal shows as text and keeps the card open.
  await field('lastName').fill('Boom');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert((await dialog.textContent()).includes('Too many tries'), 'error text');
  await field('lastName').fill('Lee');
  saved.length = 0;
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Save');
  assert(
    JSON.stringify(saved) ===
      JSON.stringify([
        ['profile', { firstName: 'Anna', about: 'Hello' }],
        ['username', { username: 'free_name' }],
      ]),
    `saved only what changed: ${JSON.stringify(saved)}`
  );
};

const photoSteps = async () => {
  await opened();
  await field('photo').setInputFiles({
    name: 'p.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1, 2, 3, 4]),
  });
  await until(() => photos.length === 1, 'the photo is set');
  assert(uploads === 1, 'uploaded first');
  assert(JSON.stringify(photos[0]) === '{"token":"tok1"}', 'token sent');
  await dialog.locator('[data-action="remove-photo"]').click();
  await until(() => photos.length === 2, 'the photo is removed');
  assert(JSON.stringify(photos[1]) === '{"remove":true}', 'remove sent');
  await gone(
    dialog.locator('[data-action="remove-photo"]'),
    'no Remove without a photo'
  );
  // Nothing changed: Save sends nothing.
  saved.length = 0;
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed after Save');
  assert(saved.length === 0, 'nothing changed, nothing sent');
};

const closeSteps = async () => {
  await opened();
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
  await opened();
  await page.mouse.click(5, 790);
  await gone(dialog, 'a click outside closes');
};

await finish(async () => {
  await openSteps();
  await editSteps();
  await photoSteps();
  await closeSteps();
});
