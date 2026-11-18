// Production UI + actual Lino login routes; only the Telegram SDK is faked.
// Deliberately hold an old QR response across a mode switch, then exercise
// phone cancellation, unmount and successful code/2FA retries.
import { loginFixture } from './helpers/telegram-login-fakes.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const fixture = await loginFixture();
const { store, clients, mtproto } = fixture;
const { base, page, until, finish } = await openChatApp('telegram-login', {
  store,
  serverOptions: { telegramMtproto: mtproto, telegramCreds: fixture.creds },
});
await page.route('**/api/telegram/accounts', (route) =>
  fulfil(route, {
    ok: true,
    accounts: [{ account: 1, current: true, name: 'Fixture account' }],
    limit: 3,
    canAdd: true,
    next: 2,
  })
);
await page.route('**/api/telegram/accounts-unread', (route) =>
  fulfil(route, { ok: true, unread: [] })
);
let releaseQr;
let qrRequested = false;
let qrCancelled = false;
const qrReleased = new Promise((resolve) => {
  releaseQr = resolve;
});
await page.route(
  '**/api/auto-import/telegram/login/qr-start',
  async (route) => {
    qrRequested = true;
    await qrReleased;
    await fulfil(route, {
      id: 'stale-qr-fixture',
      url: 'tg://login?token=ZmFrZQ',
      expires: 4102444800,
    });
  }
);
for (const action of ['cancel', 'qr-cancel']) {
  await page.route(
    `**/api/auto-import/telegram/login/${action}`,
    async (route) => {
      if (route.request().postData()?.includes('stale-qr-fixture')) {
        qrCancelled = true;
        await fulfil(route, { cancelled: true });
      } else {
        await route.continue();
      }
    }
  );
}
const form = page.locator('.tg-login');
const field = (name) => form.locator(`[data-field="${name}"]`);
const submit = () => form.locator('[data-action="telegram-login"]').click();
const mode = () => form.locator('[data-action="telegram-login-mode"]').click();
const add = async () => {
  await page.locator('[data-action="account-add"]').click();
  await form.waitFor({ timeout: 5000 });
};
const credentials = async () => {
  await field('apiId').fill('2040');
  await field('apiHash').fill('0123456789abcdef0123456789abcdef');
  if (await field('phone').count()) {
    await field('phone').fill('+15551234567');
  }
};
const phoneSteps = async () => {
  await page.goto(base);
  await page.locator('[data-chat="telegram:11"]').waitFor({ timeout: 15000 });
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-accounts"]').click();
  await add();
  await mode();
  await credentials();
  await submit();
  await until(() => qrRequested, 'QR start held');
  await mode();
  releaseQr();
  await until(
    async () => qrCancelled || (await form.locator('.tg-qr').count()) > 0,
    'old QR reply handled'
  );
  if (process.env.TELEGRAM_LOGIN_SCREENSHOT) {
    await page.screenshot({ path: process.env.TELEGRAM_LOGIN_SCREENSHOT });
  }
  assert(
    (await form.locator('.tg-qr').count()) === 0,
    'late QR cannot replace chosen phone flow'
  );
  assert(qrCancelled, 'late QR controller is cancelled');

  await credentials();
  await submit();
  await field('code').waitFor({ timeout: 5000 });
  await mode();
  await until(
    () => clients[0]?.closed,
    'phone controller cancelled on mode change'
  );
  await mode();
  await credentials();
  await submit();
  await field('code').waitFor({ timeout: 5000 });
  await page.locator('[data-action="accounts-back"]').click();
  await until(
    () => clients[1]?.closed,
    'phone controller cancelled on unmount'
  );
  await add();
  await credentials();
  await submit();
  await field('code').waitFor({ timeout: 5000 });
  await field('code').fill('wrong');
  await submit();
  await form.locator('[role="alert"]').waitFor({ timeout: 5000 });
  await field('code').fill('12345');
  await submit();
  await field('password').waitFor({ timeout: 5000 });
  assert(
    (await field('code').inputValue()) === '',
    'code cleared after accepted step'
  );
  await field('password').fill('wrong');
  await submit();
  await form.locator('[role="alert"]').waitFor({ timeout: 5000 });
  await field('password').fill('fixture-password');
  await submit();
  await page.locator('.tg-login-done').waitFor({ timeout: 5000 });
  assert(clients[2].closed, 'success closes temporary client');
  assert(
    (await store.get('secret:telegram@2:user-session'))?.value ===
      'SYNTHETIC_OFFLINE_SESSION',
    'actual route persists reusable session'
  );
};

const finderSteps = async () => {
  await page.locator('[data-action="close"]').click();
  await page.locator('[data-view="connections"]').click();
  await page
    .locator(
      '[data-provider-id="telegram"] [data-action="open-connection-detail"]'
    )
    .click();
  const finder = page.locator('.tg-sessions');
  await finder.locator('[data-action="telegram-session-scan"]').click();
  const saved = finder.locator('[data-kind="user-session"]');
  await saved
    .locator('[data-action="telegram-session-use"]')
    .waitFor({ timeout: 5000 });
  await saved.locator('[data-action="telegram-session-use"]').click();
  await saved.locator('[data-connected]').waitFor({ timeout: 5000 });
  assert(
    (await store.get('secret:telegram:user-session'))?.value === fixture.legacy,
    'finder imports legacy primary session'
  );
  assert(await fixture.unchanged(), 'finder leaves original session untouched');

  const phone = finder.locator('[data-kind="user-password"]');
  await phone.locator('[data-action="telegram-session-use"]').click();
  await phone.locator('[data-field="entry-code"]').waitFor({ timeout: 5000 });
  const pending = clients.at(-1);
  await finder.locator('[data-action="telegram-session-scan"]').click();
  await until(() => pending.closed, 'finder rescan cancels inline phone login');
  await phone.locator('[data-action="telegram-session-use"]').click();
  await phone.locator('[data-field="entry-code"]').fill('12345');
  await phone.locator('[data-action="telegram-session-login"]').click();
  await phone.locator('[data-field="entry-password"]').fill('fixture-password');
  await phone.locator('[data-action="telegram-session-login"]').click();
  await phone.locator('[data-connected]').waitFor({ timeout: 5000 });
  assert(
    (await store.get('secret:telegram:user-session'))?.value ===
      'SYNTHETIC_OFFLINE_SESSION',
    'finder phone/2FA saves verified session'
  );
};

await finish(async () => {
  try {
    await phoneSteps();
    await finderSteps();
  } finally {
    await fixture.close();
  }
});
