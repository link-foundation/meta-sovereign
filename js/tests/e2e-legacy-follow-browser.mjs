// Actual production Lino routes: failed re-verification cannot say Connected.
import { followSessionFixture } from './helpers/telegram-follow-session.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const f = await followSessionFixture();
const { base, page, until, finish } = await openChatApp('legacy-follow', {
  store: f.store,
  serverOptions: {
    telegramCreds: f.creds,
    telegramMtproto: f.mtproto,
    telegramAccount: f.account,
  },
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ off: true, v: 5 })
  );
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
await finish(async () => {
  try {
    await page.goto(`${base}/#/connections`);
    await page
      .locator(
        '[data-provider-id="telegram"] [data-action="open-connection-detail"]'
      )
      .click();
    const finder = page.locator('.tg-sessions');
    await finder.locator('[data-action="telegram-session-scan"]').click();
    const row = finder.locator('[data-kind="user-session"]');
    const connect = row.locator('[data-action="telegram-session-use"]');
    await connect.waitFor();
    f.state.refuse = true;
    const before = f.state.clients.length;
    await connect.evaluate((button) => {
      button.click();
      button.click();
    });
    await finder.getByRole('alert').waitFor({ timeout: 7000 });
    assert(
      (await row.locator('[data-connected]').count()) === 0,
      'failed verification cannot claim connected'
    );
    assert(
      (await f.store.get('secret:telegram:user-session'))?.value ===
        'previous-session',
      'previous session survives'
    );
    assert(
      f.state.clients.length === before + 1,
      'double click checks only once'
    );
    f.state.refuse = false;
    // A malformed response also cannot produce a connected badge.
    await page.route('**/api/auto-import/telegram/use', (route) =>
      fulfil(route, {})
    );
    await connect.click();
    await finder
      .getByRole('alert')
      .filter({ hasText: 'not confirmed' })
      .waitFor();
    assert(
      (await row.locator('[data-connected]').count()) === 0,
      'missing receipt is not a connection'
    );
    await page.unroute('**/api/auto-import/telegram/use');
    await connect.click();
    await row.locator('[data-connected]').waitFor();
    await until(
      () => f.state.clients.every((c) => c.closed),
      'temporary clients released'
    );
    assert(
      (await f.store.get('secret:telegram:user-session'))?.value === f.session,
      'verified import persists'
    );
    assert(await f.unchanged(), 'source file remains unchanged');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'mobile finder fits'
    );
  } finally {
    await f.close();
  }
});
