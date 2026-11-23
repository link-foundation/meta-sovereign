import { assert, fulfil } from './e2e-chat.mjs';

export const verifyHhProviders = async ({ page, base, store, until, hh }) => {
  const selector = page.locator('[data-chat-provider]');
  const telegram = page.locator('[data-chat="telegram:5"]');
  const headHunter = page.locator('[data-chat="hh:chat:41"]');
  await telegram.waitFor();
  await headHunter.waitFor();
  if (process.env.HH_PROVIDER_BEFORE === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-provider-before.png',
    });
    assert(await selector.count(), 'the chat directory has a provider scope');
    return;
  }
  await headHunter.locator('[data-unread="1"]').waitFor();
  await selector.selectOption('hh');
  await telegram.waitFor({ state: 'hidden' });
  await headHunter.waitFor();
  if (process.env.HH_PROVIDER_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-provider-chat.png',
    });
  }
  await selector.selectOption('telegram');
  await headHunter.waitFor({ state: 'hidden' });
  await telegram.waitFor();
  await selector.selectOption('all');
  await headHunter.waitFor();

  const telegramRead = {
    id: 'read:telegram:5',
    source: 'telegram',
    chat: '5',
    unreadTopId: 1,
    unreadCount: 1,
  };
  await store.put(telegramRead);
  await page.route('**/api/telegram/dialog-state', (route) =>
    fulfil(route, { ok: true, read: telegramRead })
  );
  await page.goto(`${base}/#/operator`);
  const hhCard = page.locator('[data-operator-chat^="hh:"]');
  const telegramCard = page.locator('[data-operator-chat="telegram:5"]');
  await selector.selectOption('telegram');
  await telegramCard.waitFor();
  await selector.selectOption('hh');
  await hhCard.waitFor();
  await telegramCard.waitFor({ state: 'hidden' });
  assert(
    hh.calls.every((call) => call.method === 'GET'),
    'viewing Operator is read-only'
  );
  if (process.env.HH_PROVIDER_SCREENSHOTS === '1') {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-hh-provider-operator.png',
    });
  }
  const id = (await hhCard.getAttribute('data-operator-chat'))
    .split(':')
    .at(-1);
  const latest = hh.chats.get(id).at(-1).id;
  await page.locator(`[data-row="msg:hh:chat:${id}:${latest}"]`).waitFor();
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () => (await store.get(`read:hh:chat:${id}`)).unreadCount === 0,
    'Operator saves the provider’s confirmed unread count'
  );
  assert(
    hh.calls
      .filter(({ method }) => method === 'PUT')
      .map(({ path }) => path)
      .join() === `/common/chats/${id}/message/${latest}/read`,
    'only the displayed HeadHunter thread and boundary are acknowledged'
  );
  assert(
    (await store.get(telegramRead.id)).unreadCount === 1,
    'Telegram is unaffected'
  );
};
