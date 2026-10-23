// Real browser e2e for "Sign in to WhatsApp Web" on the WhatsApp card on
// Connections (R-Z9): the terms notice is shown, the button asks the server
// to open the (visible) window, the card says to scan the QR yourself, and
// once the server reports the chat list was seen the card says signed in.
// The server routes are faked in the page, so no browser window opens and
// nothing reaches WhatsApp. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:whatsapp-signin

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const { base, page, until, finish } = await openChatApp('whatsapp-signin', {
  store: createMemoryStore(),
});

let status = { state: 'closed', open: false, signedIn: false };
const calls = [];
await page.route('**/api/whatsapp/web', (route) =>
  fulfil(route, { ok: true, ...status })
);
await page.route('**/api/whatsapp/web/sign-in', (route) => {
  calls.push('sign-in');
  status = { state: 'waiting', open: true, signedIn: false };
  return fulfil(route, { ok: true, ...status });
});
await page.route('**/api/whatsapp/web/close', (route) => {
  calls.push('close');
  status = { state: 'closed', open: false, signedIn: false };
  return fulfil(route, { ok: true, ...status });
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.click('button[data-view="connections"]');
  const card = page.locator('article[data-provider-id="whatsapp"]');
  await card.waitFor({ timeout: 15000 });

  // The notice is on the card before anything is clicked.
  const terms = await card.locator('[data-whatsapp-terms]').textContent();
  assert(/do not allow automated or bulk/.test(terms), `terms: ${terms}`);
  assert(
    (await card
      .locator('.whatsapp-web')
      .getAttribute('data-whatsapp-state')) === 'closed',
    'starts closed'
  );

  await card.locator('[data-action="whatsapp-web-sign-in"]').click();
  await until(async () => calls.includes('sign-in'), 'sign-in requested');
  await card.locator('[data-action="whatsapp-web-close"]').waitFor();
  const waiting = await card.locator('.whatsapp-web').textContent();
  assert(/scan the QR code yourself/.test(waiting), `waiting: ${waiting}`);
  assert(
    await card.locator('[data-action="whatsapp-web-sign-in"]').isDisabled(),
    'no second window while one is open'
  );

  // The server saw the chat list and closed the window by itself.
  status = {
    state: 'signed-in',
    open: false,
    signedIn: true,
    signedInAt: '2026-10-24T10:00:00.000Z',
  };
  await until(
    async () =>
      (await card
        .locator('.whatsapp-web')
        .getAttribute('data-whatsapp-state')) === 'signed-in',
    'the card reports signed in',
    8000
  );
  const done = await card.locator('.whatsapp-web').textContent();
  assert(/Signed in to WhatsApp Web/.test(done), `signed in text: ${done}`);
});
