// Real browser e2e for Privacy and security (R-Y139), as Telegram Desktop's
// Settings → Privacy and Security has it: from "My Telegram profile" a
// dialog lists who can see the phone number, last seen and more (changing
// last seen to My contacts sends that choice), the active sessions (this
// device marked and not terminable; another terminated only after an
// in-page confirmation) and the blocked users (Unblock). Telegram's
// refusals show as text. Telegram's answers faked in the page, a fake chat
// in a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:privacy

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

const { base, page, until, finish } = await openChatApp('privacy', { store });

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
const keys = [
  ['phoneNumber', 'contacts', 0, 0],
  ['addedByPhone', 'everybody', 0, 0],
  ['lastSeen', 'everybody', 2, 1],
  ['profilePhoto', 'other', 0, 0],
  ['about', 'nobody', 0, 0],
].map(([key, choice, allow, disallow]) => ({
  key,
  choice,
  label: choice === 'other' ? 'close-friends' : null,
  allow,
  disallow,
  options:
    key === 'addedByPhone'
      ? ['everybody', 'contacts']
      : ['everybody', 'contacts', 'nobody'],
}));
const sets = [];
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys })
);
await page.route('**/api/telegram/privacy-set', (route) => {
  const body = route.request().postDataJSON();
  sets.push(body);
  const row = keys.find((k) => k.key === body.key);
  return body.key === 'about'
    ? fulfil(route, { ok: false, error: 'x', code: 'privacy-too-long' })
    : fulfil(route, { ok: true, ...row, choice: body.choice });
});
const ttlSets = [];
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/privacy-ttl-set', (route) => {
  ttlSets.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    period: route.request().postDataJSON().period,
  });
});
const session = (hash, extra) => ({
  hash,
  current: false,
  official: false,
  pending: false,
  device: 'Pixel 8',
  platform: 'Android',
  system: '14',
  app: 'Telegram Android',
  appVersion: '10.1',
  ip: '1.2.3.4',
  country: 'NL',
  region: 'NH',
  created: '2026-01-01T10:00:00.000Z',
  active: '2026-01-02T10:00:00.000Z',
  ...extra,
});
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, {
    ok: true,
    ttlDays: 180,
    sessions: [
      session('1', { current: true, device: 'This Mac' }),
      session('2'),
      session('3', { device: 'Old Phone' }),
    ],
  })
);
const ended = [];
await page.route('**/api/telegram/session-terminate', (route) => {
  const body = route.request().postDataJSON();
  ended.push(body);
  return body.hash === '3'
    ? fulfil(route, { ok: false, error: 'x', code: 'hash-invalid' })
    : fulfil(route, { ok: true });
});
const unblocked = [];
const blockedAsked = [];
await page.route('**/api/telegram/blocked', (route) => {
  const body = route.request().postDataJSON();
  blockedAsked.push(body);
  const items = (ids) =>
    ids.map((id) => ({
      id,
      accessHash: `${id}0`,
      name: `Blocked ${id}`,
      username: '',
    }));
  return fulfil(
    route,
    body.offset === 0
      ? { ok: true, count: 3, items: items(['41', '42']), next: 2 }
      : { ok: true, count: 3, items: items(['43']), next: null }
  );
});
await page.route('**/api/telegram/unblock', (route) => {
  unblocked.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const dialog = page.locator('[data-dialog="privacy"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const row = (key) => dialog.locator(`[data-privacy-key="${key}"]`);
const select = (key) => dialog.locator(`[data-field="privacy-${key}"]`);
const sessionRow = (hash) => dialog.locator(`[data-session="${hash}"]`);

const rulesSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await row('lastSeen').waitFor({ timeout: 5000 });
  assert((await select('lastSeen').inputValue()) === 'everybody', 'last seen');
  assert((await select('phoneNumber').inputValue()) === 'contacts', 'phone');
  assert((await row('addedByPhone').count()) === 0, 'find-by-number hidden');
  const text = await row('lastSeen').textContent();
  assert(
    text.includes('Always allow: 2') && text.includes('Never allow: 1'),
    `exceptions counted: ${text}`
  );
  assert(
    (await row('profilePhoto').textContent()).includes('Close friends'),
    'a read-only label'
  );
  await select('lastSeen').selectOption('contacts');
  await until(() => sets.length === 1, 'setPrivacy asked');
  assert(
    JSON.stringify(sets[0]) ===
      JSON.stringify({ key: 'lastSeen', choice: 'contacts' }),
    `request body: ${JSON.stringify(sets[0])}`
  );
  await until(
    async () => (await select('lastSeen').inputValue()) === 'contacts',
    'the choice shown'
  );
  // Phone number Nobody reveals "who can find me by my number".
  await select('phoneNumber').selectOption('nobody');
  await row('addedByPhone').waitFor({ timeout: 5000 });
  // A refusal shows as text.
  await select('about').selectOption('everybody');
  await dialog.locator('[role="alert"]').waitFor();
  assert(
    (await dialog.textContent()).includes('Too many exceptions'),
    'refusal text'
  );
};

// The default auto-delete timer of new chats (R-Y151): the current period
// shows, a click opens the choices, 1 week sends 604800.
const autoDeleteSteps = async () => {
  const button = dialog.locator('[data-action="default-ttl"]');
  await button.waitFor({ timeout: 5000 });
  assert(
    (await button.textContent()).includes('Off'),
    'the default is Off at first'
  );
  assert(
    (await dialog.textContent()).includes('new chats'),
    'the line says it applies to new chats'
  );
  assert(ttlSets.length === 0, 'nothing sent before Save');
  await button.click();
  await dialog.locator('[data-ttl="86400"]').waitFor();
  await dialog.locator('[data-ttl="604800"]').check();
  await dialog.locator('[data-action="ttl-save"]').click();
  await until(() => ttlSets.length === 1, 'the default timer asked');
  assert(
    JSON.stringify(ttlSets[0]) === JSON.stringify({ period: 604800 }),
    `period sent: ${JSON.stringify(ttlSets)}`
  );
  await until(
    async () =>
      (await button
        .locator('[data-default-ttl]')
        .getAttribute('data-default-ttl')) === '604800',
    'the new default shown'
  );
  assert((await button.textContent()).includes('1 week'), 'one week shown');
};

const sessionSteps = async () => {
  await sessionRow('1').waitFor({ timeout: 5000 });
  assert((await sessionRow('1').textContent()).includes('This device'), 'mine');
  assert(
    (await sessionRow('1').locator('[data-action="terminate"]').count()) === 0,
    'this device has no Terminate'
  );
  assert(
    (await dialog.locator('[data-ttl-days]').getAttribute('data-ttl-days')) ===
      '180',
    'auto-terminate period shown'
  );
  assert((await sessionRow('2').textContent()).includes('Pixel 8'), 'device');
  // Terminate asks first; Keep leaves it.
  await sessionRow('2').locator('[data-action="terminate"]').click();
  assert(ended.length === 0, 'nothing sent before the confirmation');
  await sessionRow('2').locator('[data-action="cancel-terminate"]').click();
  assert(ended.length === 0, 'Keep sends nothing');
  await sessionRow('2').locator('[data-action="terminate"]').click();
  await sessionRow('2').locator('[data-action="confirm-terminate"]').click();
  await gone(sessionRow('2'), 'the terminated session leaves the list');
  assert(
    JSON.stringify(ended) === JSON.stringify([{ hash: '2' }]),
    `terminated: ${JSON.stringify(ended)}`
  );
  // A refusal keeps the session and shows text.
  await sessionRow('3').locator('[data-action="terminate"]').click();
  await sessionRow('3').locator('[data-action="confirm-terminate"]').click();
  await until(
    async () => (await dialog.textContent()).includes('no longer exists'),
    'hash-invalid text'
  );
  assert((await sessionRow('3').count()) === 1, 'the session stays');
};

const blockedSteps = async () => {
  await dialog.locator('[data-blocked="41"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-blocked="41"]').textContent()).includes(
      'Blocked 41'
    ),
    'name'
  );
  await dialog.locator('[data-action="more-blocked"]').click();
  await dialog.locator('[data-blocked="43"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(blockedAsked.map((b) => b.offset)) === '[0,2]',
    `paged: ${JSON.stringify(blockedAsked)}`
  );
  await gone(dialog.locator('[data-action="more-blocked"]'), 'no more pages');
  await dialog.locator('[data-blocked="42"] [data-action="unblock"]').click();
  await gone(dialog.locator('[data-blocked="42"]'), 'unblocked row leaves');
  assert(
    JSON.stringify(unblocked) ===
      JSON.stringify([{ id: '42', accessHash: '420' }]),
    `unblocked: ${JSON.stringify(unblocked)}`
  );
};

const closeSteps = async () => {
  // Escape closes only the privacy dialog; the profile stays.
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes Privacy and security');
  assert(
    (await page.locator('[data-dialog="my-profile"]').count()) === 1,
    'the profile card stays'
  );
};

await finish(async () => {
  await rulesSteps();
  await autoDeleteSteps();
  await sessionSteps();
  await blockedSteps();
  await closeSteps();
});
