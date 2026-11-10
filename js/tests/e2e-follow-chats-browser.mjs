import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { followChatsFixture } from './helpers/follow-chats.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const f = await followChatsFixture();
const { page, base, finish } = await openChatApp('follow-chats', f);
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
const panel = page.locator('[data-follow-chats-panel]');
const action = (name) => panel.locator(`[data-follow-chats-action="${name}"]`);
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  await panel.locator(':scope > summary').click();
  assert(
    f.calls.length === 0,
    'opening the panel does not start provider reads'
  );
  await panel.getByLabel('Conversations per provider page').fill('2');
  await panel.getByLabel('Only groups with Telegram hints').check();
  await action('load').click();
  await panel
    .getByText('No matching groups on this page.', { exact: true })
    .waitFor();
  assert(
    await action('next').isEnabled(),
    'empty filtered page still has a next page'
  );
  await action('next').click();
  await panel.locator('[data-follow-chat="2000000002"]').waitFor();
  assert(
    (await panel.locator('[data-follow-chat]').count()) === 2,
    'title and message hints match'
  );
  assert(
    await action('next').isDisabled(),
    'last provider page ends pagination'
  );
  await panel
    .locator('[data-follow-chat="2000000002"]')
    .getByRole('button')
    .click();
  const details = panel.locator('[data-follow-chat-details="2000000002"]');
  await details
    .getByText('Member 1 · 1 · @member1 · Owner', { exact: true })
    .waitFor();
  await details.getByText('Newest group message', { exact: true }).waitFor();
  await action('nextMembers').click();
  await details
    .getByText('Member 51 · 51 · @member51', { exact: true })
    .waitFor();
  assert(
    await action('nextMembers').isDisabled(),
    'member pagination ends at provider total'
  );
  await page.route('**/api/automations/follow/chats?**', (route) =>
    fulfil(route, { code: 'not-connected', error: 'fixture disconnected' }, 409)
  );
  await action('load').click();
  await panel.getByRole('alert').waitFor();
  assert(
    (await panel.locator('[data-follow-chat]').count()) === 2,
    'failed read preserves current group page'
  );
  assert(await details.isVisible(), 'failed read preserves member details');
  await page.unroute('**/api/automations/follow/chats?**');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'group discovery fits a phone'
  );
  assert(
    f.calls.every(({ method }) =>
      [
        'messages.getConversations',
        'messages.getConversationsById',
        'messages.getConversationMembers',
        'messages.getHistory',
      ].includes(method)
    ),
    'discovery is read-only'
  );
  await panel.getByLabel('Only groups with Telegram hints').uncheck();
  assert(
    (await panel.locator('[data-follow-chat]').count()) === 0,
    'scope changes clear old results'
  );
});
