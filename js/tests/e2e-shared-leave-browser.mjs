// Production UI regression: partial receipts, uncertainty and double clicks.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { requestBody } from './helpers/http-wire.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:-1007:1',
  source: 'telegram',
  chat: '-1007',
  chatName: 'Study circle',
  chatType: 'channel',
  sender: '2',
  body: 'History remains visible.',
  timestamp: new Date().toISOString(),
});
const { page, base, finish } = await openChatApp('shared-leave', { store });
page.setDefaultTimeout(7000);
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
const channels = [1, 2].map((id) => ({
  chat: `-100${id}`,
  title: `Quiet channel ${id}`,
  date: 1_700_000_000,
}));
await page.route('**/api/telegram/inactive-channels', (route) =>
  fulfil(route, { ok: true, channels })
);
let mode = 'partial';
let leaves = 0;
let removals = 0;
await page.route('**/api/telegram/leave-channels', async (route) => {
  leaves += 1;
  const body = requestBody(route.request());
  if (mode === 'missing') {
    return fulfil(route, { ok: true });
  }
  return fulfil(route, {
    ok: mode === 'partial',
    left: body.chats.slice(0, 1),
    ...(mode === 'unknown' ? { code: 'outcome-unknown' } : {}),
  });
});
await page.route('**/api/telegram/remove-chat', (route) => {
  removals += 1;
  return fulfil(route, { ok: false, code: 'outcome-unknown' });
});
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-follow-chats-panel]').waitFor();
  for (const next of ['partial', 'unknown', 'missing']) {
    mode = next;
    await page.evaluate(() =>
      globalThis.dispatchEvent(new globalThis.CustomEvent('ms-channel-limit'))
    );
    const dialog = page.locator('[data-dialog="inactive-channels"]');
    for (const id of [1, 2]) {
      await dialog.locator(`[data-limit-chat="-100${id}"] input`).check();
    }
    const before = leaves;
    await dialog.locator('[data-action="submit"]').evaluate((button) => {
      button.click();
      button.click();
    });
    await dialog.getByRole('alert').waitFor();
    assert(leaves === before + 1, 'one request on a synchronous double click');
    assert(
      await dialog.locator('[data-limit-chat="-1002"] input').isDisabled(),
      'uncertain selection stays visible and blocked'
    );
    assert(
      await dialog.locator('[data-action="submit"]').isDisabled(),
      'no uncertain replay'
    );
    assert(
      (await dialog.locator('[data-limit-chat]').count()) ===
        (mode === 'missing' ? 2 : 1),
      'only explicit receipts remove rows'
    );
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  }
  await page.goto(`${base}/#/chat`);
  const row = page.locator('[data-chat="telegram:-1007"]');
  await row.click({ button: 'right' });
  await page.locator('.msg-context-menu [data-action="leaveChannel"]').click();
  const dialog = page.locator('.remove-chat-dialog');
  await dialog.locator('[data-action="confirm-remove"]').evaluate((button) => {
    button.click();
    button.click();
  });
  await dialog
    .getByRole('alert')
    .filter({ hasText: 'Telegram did not confirm' })
    .waitFor();
  assert(removals === 1, 'one membership request');
  assert(
    await dialog.locator('[data-action="confirm-remove"]').isDisabled(),
    'unknown leave cannot repeat'
  );
  assert((await row.count()) === 1, 'chat remains visible');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'mobile uncertainty fits the viewport'
  );
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
});
