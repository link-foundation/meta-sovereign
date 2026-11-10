// The production bundle, routes and Lino codec with only Telegram's SDK RPCs faked.
import { telegramBacklinksFixture } from './helpers/telegram-backlinks.mjs';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const f = await telegramBacklinksFixture();
const { telegramAccount: _account, ...timing } = f.options;
const { base, page, until, finish } = await openChatApp(
  'follow-telegram-backlinks',
  {
    store: f.store,
    telegramAccount: f.account,
    serverOptions: { follow: { backlinks: timing } },
  }
);
await page.addInitScript(() => {
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ off: true, v: 5 })
  );
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
await finish(async () => {
  try {
    await page.goto(`${base}/#/automation`);
    const card = page.locator('[data-follow-backlinks]');
    await card.locator('summary').click();
    const field = (key) =>
      card.locator(`[data-follow-backlink-field="${key}"]`);
    const action = (key) =>
      card.locator(`[data-follow-backlink-action="${key}"]`);
    const job = card.locator('[data-follow-backlink-job]');
    await field('source').selectOption('telegram');
    await field('chats').fill('-7');
    await field('backlink').fill('https://vk.me/join/valid_invite');
    await field('monitorMs').fill('2000');
    await field('intervalMs').fill('1000');
    await field('deleteIncoming').check();
    await action('preview').click();
    const plan = card.locator('[data-follow-backlink-plan]');
    await plan.waitFor();
    assert(
      (await plan.textContent()).includes('Telegram account 7'),
      'review names the real Telegram account'
    );
    assert(f.writes.length === 0, 'review is read only');
    await action('apply').evaluate((button) => {
      button.click();
      button.click();
    });
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(
      f.writes.filter((r) => r.className === 'messages.SendMessage').length ===
        1,
      'double click sends once'
    );
    assert(
      (await job.textContent()).includes('2 deletions confirmed'),
      'per-message readback is rendered'
    );
    const [remove] = f.writes.filter(
      (r) => r.className === 'messages.DeleteMessages'
    );
    assert(
      remove.revoke === false,
      'incoming cleanup remains local to the account'
    );
    f.state.entity = {
      className: 'Channel',
      id: 7n,
      title: 'Telegram supergroup',
      megagroup: true,
    };
    await field('chats').fill('-1007');
    await action('preview').click();
    await card
      .getByRole('alert')
      .filter({ hasText: 'Disable cleanup' })
      .waitFor();
    assert(
      f.writes.length === 2,
      'unsupported cleanup does not issue another write'
    );
    await field('deleteIncoming').uncheck();
    await action('preview').click();
    await plan.waitFor();
    const previousJob = await job.getAttribute('data-follow-backlink-job');
    await action('apply').click();
    await until(
      async () =>
        (await job.getAttribute('data-follow-backlink-job')) !== previousJob,
      'the new supergroup run replaces the previous receipt'
    );
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(
      (await job.textContent()).includes('-1007'),
      'supergroup receipt keeps its signed ID'
    );
    assert(
      f.writes.filter((r) => r.className === 'messages.DeleteMessages')
        .length === 1,
      'supergroup run never deletes for everyone'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await until(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
      'Telegram backlink controls fit mobile'
    );
  } finally {
    await f.close();
  }
});
