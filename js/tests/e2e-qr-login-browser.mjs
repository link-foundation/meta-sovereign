// Real browser e2e for signing in to Telegram by QR code (R-Y203), as
// Telegram Desktop offers it: the sign-in form has "Log in by QR code" and
// "Log in by phone number"; the QR way shows the code as an SVG drawn in the
// page with the three steps, shows a fresh code when the server renews it,
// and after the (faked) server reports success the form says signed in. The
// login routes are faked in the page, a fake chat sits in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:qr-login

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
  body: 'hello',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('qr-login', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const accounts = [{ account: 1, current: true, id: '99', name: 'Me Myself' }];
await page.route('**/api/telegram/accounts', (route) =>
  fulfil(route, {
    ok: true,
    accounts,
    limit: 3,
    premium: false,
    canAdd: true,
    next: 2,
  })
);
await page.route('**/api/telegram/accounts-unread', (route) =>
  fulfil(route, { ok: true, unread: [] })
);

// The faked login routes: a first code, a renewed one, then success.
const calls = [];
let statuses = 0;
await page.route('**/api/auto-import/telegram/login/qr-start', (route) => {
  calls.push(['qr-start', route.request().postDataJSON()]);
  return fulfil(route, {
    id: 'tg-login-1-abc',
    url: 'tg://login?token=Zmlyc3RfdG9rZW4',
    expires: 4102444800,
  });
});
await page.route('**/api/auto-import/telegram/login/qr-status', (route) => {
  statuses += 1;
  calls.push(['qr-status', route.request().postDataJSON()]);
  return statuses === 1
    ? fulfil(route, {
        id: 'tg-login-1-abc',
        url: 'tg://login?token=c2Vjb25kX3Rva2VuX3JlbmV3ZWQ',
        expires: 4102444800,
      })
    : fulfil(route, {
        done: true,
        account: { id: '7', username: 'qruser' },
        extra: 2,
      });
});
await page.route('**/api/auto-import/telegram/login/qr-cancel', (route) => {
  calls.push(['qr-cancel', route.request().postDataJSON()]);
  return fulfil(route, { cancelled: true });
});

const form = page.locator('.tg-login');
const qrPath = () => form.locator('svg.tg-qr-code path').getAttribute('d');

await finish(async () => {
  await page.goto(`${base}/`);
  await page
    .locator(`[data-chat="telegram:${ANN}"]`)
    .waitFor({ timeout: 15000 });
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-accounts"]').click();
  await page.locator('[data-action="account-add"]').click();
  await form.waitFor({ timeout: 5000 });

  // The phone number way is the default; the toggle switches both ways.
  assert(
    (await form.locator('[data-field="phone"]').count()) === 1,
    'phone field by default'
  );
  const toggle = form.locator('[data-action="telegram-login-mode"]');
  assert(/QR/.test(await toggle.textContent()), 'offers the QR code way');
  await toggle.click();
  assert(
    (await form.locator('[data-field="phone"]').count()) === 0,
    'no phone field in QR mode'
  );
  assert(/phone number/i.test(await toggle.textContent()), 'offers phone');
  await toggle.click();
  assert(
    (await form.locator('[data-field="phone"]').count()) === 1,
    'back to phone'
  );
  await toggle.click();

  await form.locator('[data-field="apiId"]').fill('2040');
  await form.locator('[data-field="apiHash"]').fill('0'.repeat(32));
  await form.locator('[data-action="telegram-login"]').click();

  // The code appears as an SVG drawn in the page, with Desktop's steps.
  await form.locator('svg.tg-qr-code').waitFor({ timeout: 5000 });
  const started = calls.find(([name]) => name === 'qr-start')[1];
  assert(started.apiId === '2040' && started.account === 2, 'qr-start body');
  assert(started.phone === undefined, 'no phone sent');
  const first = await qrPath();
  assert(first && first.length > 200, 'the code has many modules');
  const steps = await form.locator('.tg-qr-steps li').allTextContents();
  assert(
    steps.join('|') ===
      [
        'Open Telegram on your phone',
        'Go to Settings > Devices > Link Desktop Device',
        'Point your phone at this screen to confirm login',
      ].join('|'),
    `steps: ${steps}`
  );

  // The server renewed the code: the page draws the new one.
  await until(async () => (await qrPath()) !== first, 'the code is renewed');
  assert(
    calls.some(([n, b]) => n === 'qr-status' && b.id === 'tg-login-1-abc'),
    'polled with the login id'
  );

  // Success: the form says signed in, and polling stops.
  await page.locator('.tg-login-done').waitFor({ timeout: 8000 });
  assert(
    /@qruser/.test(await page.locator('.tg-login-done').textContent()),
    'signed in as @qruser'
  );
  const seen = statuses;
  await new Promise((r) => globalThis.setTimeout(r, 2200));
  assert(statuses === seen, 'no more polling once signed in');
});
