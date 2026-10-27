// A chat with just its cached head must explain what is still loading.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp, fulfil } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const message = (n) => ({
  id: `msg:telegram:42:${n}`,
  source: 'telegram',
  chat: '42',
  chatName: 'Loading fixture',
  chatType: 'personal_chat',
  sender: '42',
  senderName: 'Fixture',
  body: `saved message ${n}`,
  timestamp: new Date(1700000000000 + n * 1000).toISOString(),
  raw: { id: n },
});
await store.put(message(50));
for (let n = 1; n <= 120; n++) {
  await store.put({
    ...message(n),
    id: `msg:telegram:43:${n}`,
    chat: '43',
    chatName: 'Automatic scrolling fixture',
  });
}
const { page, base, finish } = await openChatApp('chat-loading', { store });
let release;
let requests = 0;
let stage = 'pending';
await page.route('**/api/telegram/history', async (route) => {
  const request = route.request().postDataJSON();
  if (request.chat === '43') {
    return fulfil(route, { written: 0, cached: true, complete: false });
  }
  if (request.priority === 'prefetch') {
    return fulfil(route, { written: 0, cached: true, complete: false });
  }
  assert(request.priority === 'view', 'opened chat uses foreground priority');
  requests += 1;
  if (stage === 'pending') {
    await new Promise((resolve) => {
      release = resolve;
    });
    return fulfil(route, {
      written: 0,
      cached: true,
      complete: false,
      background: true,
    });
  }
  if (stage === 'wait') {
    return fulfil(
      route,
      { error: 'Telegram asked to wait', code: 'flood-wait', retryAfter: 2 },
      429
    );
  }
  await store.put(message(49));
  await store.put({
    id: 'history:telegram:42',
    source: 'telegram',
    chat: '42',
    oldest: 49,
    newest: 50,
    complete: true,
    tokens: [],
  });
  return fulfil(route, { written: 1, cached: false, complete: true });
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignSkin', 't3');
});
const automaticScrollSteps = async () => {
  await page.locator('[data-chat="telegram:43"]').click();
  await page.locator('[data-row="msg:telegram:43:120"]').waitFor();
  assert(
    (await page.getByText(/Showing \d+ saved messages/).count()) === 0,
    'no partial-history notice'
  );
  assert(
    (await page
      .getByRole('button', { name: 'Load earlier', exact: true })
      .count()) === 0,
    'no manual earlier-history button'
  );
  for (let n = 0; n < 3; n++) {
    await page.locator('.chat-scroll').evaluate((node) => {
      node.scrollTop = 0;
      node.dispatchEvent(new globalThis.Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(400);
  }
  await page
    .locator('[data-row="msg:telegram:43:1"]')
    .waitFor({ state: 'attached', timeout: 3000 });
};
await finish(async () => {
  await page.goto(`${base}/#chat=telegram:42`);
  await page.locator('[data-row="msg:telegram:42:50"]').waitFor();
  const status = page.locator('[data-history-status]');
  await page.locator('[data-history-status="loading"]').waitFor();
  assert(
    (await status.textContent()).includes('first'),
    'foreground loading has visible text'
  );
  assert(
    await page.locator('.chat-composer').isVisible(),
    'composer stays available'
  );

  // Resize both independent columns, using mouse and keyboard, then
  // verify the saved widths after reload once history has settled.
  const chatDivider = page.locator('[data-panel-divider="chats"]');
  const before = await page.locator('.chat-sidebar').boundingBox();
  await chatDivider.focus();
  await page.keyboard.press('ArrowRight');
  assert(
    (await page.locator('.chat-sidebar').boundingBox()).width > before.width,
    'chat column width changes'
  );
  const navDivider = page.locator('[data-panel-divider="navigation"]');
  const navBefore = await page.locator('.permanent-drawer').boundingBox();
  const grip = await navDivider.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 100);
  await page.mouse.down();
  await page.mouse.move(grip.x + 44, grip.y + 100, { steps: 5 });
  await page.mouse.up();
  assert(
    (await page.locator('.permanent-drawer').boundingBox()).width >
      navBefore.width + 20,
    'navigation drag changes width'
  );
  const iconColor = await page
    .locator('.nav-item[data-view="calls"] .icon')
    .evaluate((node) => globalThis.getComputedStyle(node).color);
  assert(
    iconColor === 'rgb(255, 255, 255)',
    `dark control icons are white: ${iconColor}`
  );
  assert(
    (await page.locator('.chat-sidebar [data-action="my-profile"]').count()) ===
      0,
    'profile moved out of chat header'
  );
  assert(
    (await page.locator('.chat-sidebar [data-action="calls"]').count()) === 0,
    'calls moved out of chat header'
  );

  stage = 'wait';
  release();
  await page.locator('[data-history-status="waiting"]').waitFor();
  assert(
    (await status.textContent()).includes('Telegram asked to wait'),
    'rate wait explained visibly'
  );
  const waitingRequests = requests;
  await page.waitForTimeout(500);
  assert(requests === waitingRequests, 'no retry before rate wait expires');
  stage = 'complete';
  await page
    .locator('[data-row="msg:telegram:42:49"]')
    .waitFor({ timeout: 10000 });
  await status.waitFor({ state: 'detached' });
  await page.locator('[data-history-complete]').waitFor();
  assert(
    (await page.locator('[data-history-complete]').textContent()).includes(
      'All available messages loaded'
    ),
    'completion is explicit for a short conversation'
  );
  await page.locator('[data-action="chat-about"]').click();
  const details = page.locator('.person-panel');
  await details.waitFor();
  const detailsBefore = await details.boundingBox();
  await page.locator('[data-panel-divider="details"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert(
    (await details.boundingBox()).width > detailsBefore.width,
    'details column also resizes'
  );
  await details.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.locator('[data-row="msg:telegram:42:50"]').waitFor();
  assert(
    (await page.locator('.permanent-drawer').boundingBox()).width >
      navBefore.width + 20,
    'navigation width persists'
  );
  await page.locator('[data-panel-divider="chats"]').focus();
  await page.keyboard.press('Enter');
  assert(
    Math.abs((await page.locator('.chat-sidebar').boundingBox()).width - 320) <
      2,
    'Enter resets chat width'
  );
  await automaticScrollSteps();
});
