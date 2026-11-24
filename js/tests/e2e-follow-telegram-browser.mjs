import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import {
  followTelegramFixture,
  followUpdates,
} from './helpers/follow-telegram.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const f = followTelegramFixture();
const { page, base, finish, until } = await openChatApp('follow-telegram', {
  store: f.store,
  telegramAccount: f.account,
});
page.setDefaultTimeout(10000);
await page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);
const panel = page.locator('[data-follow-telegram]');
const action = (name) =>
  panel.locator(`[data-follow-telegram-action="${name}"]`);
const field = (name) => panel.locator(`[data-follow-telegram-field="${name}"]`);
const result = panel.locator('[data-follow-telegram-result]');
const retry = (name) => panel.locator(`[data-follow-read-field="${name}"]`);
const verifyReadControls = async () => {
  await retry('attempts').fill('2');
  await retry('retryDelayMs').fill('0');
  await retry('retryMaxDelayMs').fill('0');
  let attempts = 0;
  f.state.read = (request) => {
    if (request.className === 'messages.GetDialogs') {
      attempts++;
      throw Object.assign(new Error('private timeout diagnostic'), {
        code: 'ETIMEDOUT',
      });
    }
  };
  await action('list').click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'The read timed out' })
    .waitFor();
  assert(
    attempts === 2,
    'UI attempt budget reaches the single-attempt provider boundary'
  );
  attempts = 0;
  await retry('retryDelayMs').fill('60000');
  await retry('retryMaxDelayMs').fill('300000');
  await action('list').click();
  await until(() => attempts === 1, 'first read before cancellation');
  await action('stop').click();
  await panel.getByRole('alert').filter({ hasText: 'Cancelled' }).waitFor();
  assert(
    attempts === 1,
    'scoped stop wakes a long retry delay without another RPC'
  );
  f.state.read = null;
  await retry('retryDelayMs').fill('0');
  await retry('retryMaxDelayMs').fill('0');
};
const verifyReviewedPolicy = async () => {
  await panel
    .getByText('Reads: up to 2 attempts · initial delay 0 ms · maximum 0 ms', {
      exact: true,
    })
    .waitFor();
  await retry('attempts').fill('1');
  assert(
    (await panel.locator('[data-follow-telegram-plan]').count()) === 0,
    'changing the read policy discards the reviewed operation'
  );
  await action('preview').click();
  await panel.locator('[data-follow-telegram-plan]').waitFor();
};
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  await panel.locator(':scope > summary').click();
  assert(f.calls.length === 0, 'opening never starts provider reads');
  await verifyReadControls();
  await action('list').click();
  await panel.locator('[data-follow-telegram-chat="-1007"]').waitFor();
  assert(f.writes.length === 0, 'listing is read-only');
  f.state.member = false;
  await field('target').fill('study_group');
  await action('preview').click();
  await panel.locator('[data-follow-telegram-plan]').waitFor();
  await verifyReviewedPolicy();
  assert(f.writes.length === 0, 'preview is read-only');
  await action('apply').evaluate((button) => {
    button.click();
    button.click();
  });
  await result
    .getByText('Telegram confirmed the operation', { exact: true })
    .waitFor();
  assert(
    f.writes.length === 3,
    'one join, mute and archive after double click'
  );
  assert((await action('apply').count()) === 0, 'consumed plan cannot repeat');
  await field('operation').selectOption('preferences');
  await field('mute').selectOption('false');
  await field('archive').selectOption('false');
  await action('preview').click();
  await action('apply').click();
  await result
    .getByText('Telegram confirmed the operation', { exact: true })
    .waitFor();
  assert(
    !f.state.muted && !f.state.archived,
    'unmute and main-list preferences are independent'
  );
  await field('operation').selectOption('leave');
  await action('preview').click();
  await panel
    .getByText(
      'Leave membership only. This operation does not request deletion of chat history.'
    )
    .waitFor();
  await action('apply').click();
  await result
    .getByText('Telegram confirmed the operation', { exact: true })
    .waitFor();
  assert(!f.state.member, 'reviewed leave acknowledged');
  assert(
    f.writes.every((r) => !r.className.endsWith('DeleteHistory')),
    'leave preserves history'
  );
  await field('operation').selectOption('join');
  f.state.reply = () => undefined;
  await action('preview').click();
  await action('apply').click();
  await result
    .getByText('Review each step; the complete operation is not confirmed', {
      exact: true,
    })
    .waitFor();
  const before = f.writes.length;
  await action('preview').click();
  assert(
    await action('apply').isDisabled(),
    'unknown join blocks new preview replay'
  );
  assert(
    f.writes.length === before,
    'fresh preview never repeats uncertain write'
  );
  await action('cancel').click();
  f.state.entity = { ...f.state.entity, id: 8n, username: 'another_group' };
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  f.state.reply = async () => {
    entered.resolve();
    await release.promise;
    f.state.member = true;
    return followUpdates(f.state.entity);
  };
  await field('target').fill('another_group');
  await field('mute').selectOption('true');
  await action('preview').click();
  await action('apply').click();
  await entered.promise;
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/follow/telegram/cancel')),
    action('stop').click(),
  ]);
  release.resolve();
  await result
    .getByText(/Cancelled; no remaining steps were attempted/)
    .waitFor();
  assert(
    (await result.innerText()).includes('Membership: Telegram confirmed'),
    'cancel preserves positive in-flight receipt'
  );
  assert(
    f.writes.length === before + 1,
    'stop prevents remaining preference writes'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'membership controls fit a phone'
  );
});
