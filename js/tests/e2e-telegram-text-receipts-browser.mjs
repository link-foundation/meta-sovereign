import { textReceiptFixture } from './helpers/telegram-text-receipts.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { requestBody } from './helpers/http-wire.mjs';

const f = await textReceiptFixture();
const { base, page, until, finish } = await openChatApp(
  'telegram-text-receipts',
  f
);
page.setDefaultTimeout(10000);
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = requestBody(route.request());
  return fulfil(route, {
    ok: true,
    read: await f.store.get(`read:telegram:${chat}`),
  });
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
});
const uncertain = async (text) => {
  const row = page.locator('[data-row^="pending:"]').filter({ hasText: text });
  await until(
    () => row.locator('[data-delivery="failed"]').count(),
    'uncertain bubble retained'
  );
  assert(
    (await row.textContent()).includes(text),
    'text survives missing receipt'
  );
  assert(
    (await page
      .getByText(
        'It may have been sent. Check the chat before sending it again.',
        { exact: true }
      )
      .count()) > 0,
    'shared composer explains uncertainty before offering an explicit resend'
  );
};
await finish(async () => {
  await page.goto(`${base}/#chat=telegram:111`);
  await page.locator('[data-row="msg:telegram:111:1"]').waitFor();
  await page.locator('.chat-composer textarea').fill('Chat uncertain response');
  await page.locator('.chat-composer textarea').press('Enter');
  await uncertain('Chat uncertain response');
  await page.reload();
  await uncertain('Chat uncertain response');
  assert(f.calls.length === 1, 'refresh never replays an uncertain Chat send');
  await page.goto(`${base}/#/operator`);
  await page.locator('[data-operator-chat="telegram:111"]').waitFor();
  await uncertain('Chat uncertain response');
  await page.locator('[data-action="operator-next"]').click();
  await page.locator('[data-operator-chat="telegram:222"]').waitFor();
  await page
    .locator('.operator-card textarea')
    .fill('Operator uncertain response');
  await page.locator('.operator-card textarea').press('Enter');
  await uncertain('Operator uncertain response');
  await page.reload();
  await uncertain('Operator uncertain response');
  assert(
    f.calls.length === 2,
    'refresh never replays an uncertain Operator send'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await uncertain('Operator uncertain response');
  await page.goto(`${base}/#chat=telegram:333`);
  await page.locator('[data-row="msg:telegram:333:1"]').waitFor();
  await page.locator('.chat-composer textarea').fill('Acknowledged response');
  await page.locator('.chat-composer textarea').press('Enter');
  await page.locator('[data-row="msg:telegram:333:25"]').waitFor();
  assert(
    (await page.locator('[data-row^="pending:"]').count()) === 0,
    'matching receipt replaces only the accepted pending bubble'
  );
  assert(f.calls.length === 3, 'one RPC per intentional send');
  assert(
    f.logs.filter((entry) => entry.event === 'telegram_send_unknown').length ===
      2,
    'only uncertain writes emit the optional diagnostic'
  );
  assert(
    !JSON.stringify(f.logs).includes('uncertain response'),
    'diagnostics omit message bodies'
  );
});
