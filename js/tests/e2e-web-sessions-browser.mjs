// Real browser e2e for logged-in websites (R-Y174), as Telegram Desktop's
// Settings has it: next to the active sessions, "Websites" lists each site
// with its domain, bot, browser, platform, IP, region and last-active
// time. Disconnect and Disconnect all websites each ask in the page first
// (Keep sends nothing); only the confirmation sends the request; a refusal
// is shown as text and the site stays. Telegram's answers faked in the
// page, a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:web-sessions

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

const { base, page, until, finish } = await openChatApp('web-sessions', {
  store,
});

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
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/archive-settings', (route) =>
  fulfil(route, {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  })
);
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, { ok: true, ttlDays: 0, sessions: [] })
);
await page.route('**/api/telegram/blocked', (route) =>
  fulfil(route, { ok: true, count: 0, items: [], next: null })
);

const site = (hash, domain, extra = {}) => ({
  hash,
  domain,
  bot: 'Login Bot',
  botUsername: 'loginbot',
  browser: 'Firefox',
  platform: 'Linux',
  ip: '1.2.3.4',
  region: 'Berlin',
  created: '2026-01-01T10:00:00.000Z',
  active: '2026-01-02T10:00:00.000Z',
  ...extra,
});
await page.route('**/api/telegram/web-sessions', (route) =>
  fulfil(route, {
    ok: true,
    sessions: [
      site('11', 'one.example.org'),
      site('12', 'two.example.org', { bot: 'Other Bot', browser: 'Chrome' }),
      site('13', 'three.example.org'),
    ],
  })
);
const reset = [];
await page.route('**/api/telegram/web-session-reset', (route) => {
  const body = route.request().postDataJSON();
  reset.push(body);
  return body.hash === '13'
    ? fulfil(route, { ok: false, error: 'x', code: 'hash-invalid' })
    : fulfil(route, { ok: true });
});
let resetAll = 0;
await page.route('**/api/telegram/web-sessions-reset-all', (route) => {
  resetAll += 1;
  return fulfil(route, { ok: true });
});

const dialog = page.locator('[data-dialog="privacy"]');
const siteRow = (hash) => dialog.locator(`[data-web-session="${hash}"]`);
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

const listSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await siteRow('11').waitFor({ timeout: 5000 });
  const text = await siteRow('11').textContent();
  for (const part of [
    'one.example.org',
    'Login Bot',
    'Firefox',
    'Linux',
    '1.2.3.4',
    'Berlin',
    'Active',
  ]) {
    assert(text.includes(part), `row shows ${part}: ${text}`);
  }
  assert(
    (await dialog.locator('[data-section="web-sessions"] h4').textContent()) ===
      'Websites',
    'the Websites section'
  );
};

const oneSteps = async () => {
  // Disconnect asks first; Keep leaves it.
  await siteRow('11').locator('[data-action="web-disconnect"]').click();
  assert(reset.length === 0, 'nothing sent before the confirmation');
  await siteRow('11').locator('[data-action="cancel-terminate"]').click();
  assert(reset.length === 0, 'Keep sends nothing');
  await siteRow('11').locator('[data-action="web-disconnect"]').click();
  await siteRow('11').locator('[data-action="confirm-terminate"]').click();
  await gone(siteRow('11'), 'the disconnected site leaves the list');
  assert(
    JSON.stringify(reset) === JSON.stringify([{ hash: '11' }]),
    `disconnected: ${JSON.stringify(reset)}`
  );
  // A refusal keeps the site and shows text.
  await siteRow('13').locator('[data-action="web-disconnect"]').click();
  await siteRow('13').locator('[data-action="confirm-terminate"]').click();
  await until(
    async () => (await dialog.textContent()).includes('no longer exists'),
    'refusal text'
  );
  assert((await siteRow('13').count()) === 1, 'the site stays');
};

const allSteps = async () => {
  const all = dialog.locator('[data-action="web-disconnect-all"]');
  await all.click();
  assert(resetAll === 0, 'nothing sent before the confirmation');
  await dialog
    .locator('[data-confirm="web-all"] [data-action="cancel-terminate"]')
    .click();
  assert(resetAll === 0, 'Keep sends nothing');
  await all.click();
  await dialog
    .locator('[data-confirm="web-all"] [data-action="confirm-terminate"]')
    .click();
  await until(() => resetAll === 1, 'disconnect all sent');
  await gone(dialog.locator('[data-web-session]'), 'no site is left');
  assert(
    (await dialog.textContent()).includes('No websites'),
    'the empty line shows'
  );
  assert((await all.count()) === 0, 'no Disconnect all without sites');
};

await finish(async () => {
  await listSteps();
  await oneSteps();
  await allSteps();
});
