// Real production bundle, routes and Lino; only provider RPCs use isolated fixtures.
import { followAutoFixture } from './helpers/follow-auto.mjs';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
const f = await followAutoFixture();
const { telegramAccount: _account, ...timing } = f.options;
const { base, page, until, finish } = await openChatApp('follow-auto', {
  store: f.vk.store,
  telegramAccount: f.account,
  serverOptions: { follow: { backlinks: timing } },
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
    await page.goto(`${base}/#/automation`);
    const card = page.locator('[data-follow-backlinks]');
    await card.locator('summary').click();
    const field = (key) =>
      card.locator(`[data-follow-backlink-field="${key}"]`);
    const action = (key) =>
      card.locator(`[data-follow-backlink-action="${key}"]`);
    const plan = card.locator('[data-follow-backlink-plan]');
    const job = card.locator('[data-follow-backlink-job]');
    await field('chats').fill('2000000007');
    await field('backlink').fill('https://t.me/study_group');
    await field('monitorMs').fill('2000');
    await field('intervalMs').fill('1000');
    await field('autoFollow').check();
    await field('maxRetries').fill('2');
    await field('maxLinks').fill('5');
    await field('joinDelayMs').fill('0');
    await action('preview').click();
    await plan.waitFor();
    assert(
      (await plan.textContent()).includes('study_first'),
      'review resolves incoming target'
    );
    assert(
      (await plan.textContent()).includes('Telegram account 7'),
      'review names the real target account'
    );
    assert(
      f.member.writes.length === 0,
      'review never joins or edits preferences'
    );
    await field('maxRetries').fill('1');
    await plan.waitFor({ state: 'detached' });
    assert(
      (await action('apply').count()) === 0,
      'changing automatic policy invalidates frozen review'
    );
    await action('preview').click();
    await plan.waitFor();
    f.state.vkResponse = (call, answer) =>
      call.method === 'messages.getById' && call.params.message_ids === '100'
        ? { items: [] }
        : answer;
    await action('apply').evaluate((button) => {
      button.click();
      button.click();
    });
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    const text = await job.textContent();
    assert(
      text.includes('Posting round 2'),
      'removed post is retried with a saved prior receipt'
    );
    assert(
      text.includes('Following confirmed: 1/1 links.'),
      'target completion is visible'
    );
    await job.locator('[data-follow-auto-attempts] summary').click();
    assert(
      (await job.locator('[data-follow-auto-attempts]').textContent()).includes(
        'Message 100'
      ),
      'prior removed receipt remains inspectable'
    );
    assert(
      f.vk.calls.filter((c) => c.method === 'messages.send').length === 2,
      'double confirmation creates one two-round run'
    );
    assert(
      f.member.writes.filter((r) => r.className === 'channels.JoinChannel')
        .length === 1,
      'positive membership is not repeated'
    );
    await field('backlink').fill('https://vk.me/join/own_invite');
    assert(
      (await field('followMute').count()) === 0 &&
        (await field('followArchive').count()) === 0,
      'VK does not offer unsupported Telegram preferences'
    );
    await action('preview').click();
    await plan.waitFor();
    assert(
      (await plan.textContent()).includes('VK account 7'),
      'VK review resolves actual target account'
    );
    assert(
      (await plan.textContent()).includes('VK membership only'),
      'VK preference capability is explicit'
    );
    await action('apply').click();
    await until(
      async () =>
        (await job
          .getByText('https://vk.me/join/own_invite', { exact: true })
          .count()) > 0,
      'new VK receipt replaces previous run'
    );
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(
      f.joiningCalls.filter((c) => c.method === 'messages.joinChatByInviteLink')
        .length === 1,
      'VK membership has one positive provider receipt'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await until(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
      'automatic controls fit mobile'
    );
  } finally {
    await f.close();
  }
});
