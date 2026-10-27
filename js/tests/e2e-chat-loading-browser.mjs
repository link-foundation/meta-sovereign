// Cached chats load automatically without adding panels above the messages.
import { assertControlSpacing } from './helpers/e2e-controls.mjs';
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
const { page, base, finish } = await openChatApp('chat-loading', {
  store,
  secure: true,
});
let storiesRequested = 0;
let profileStoriesRequested = 0;
await page.route('**/api/telegram/stories', (route) => {
  storiesRequested++;
  return fulfil(route, { ok: true, peers: [], more: false });
});
await page.route('**/api/telegram/profile-stories', (route) => {
  profileStoriesRequested++;
  return fulfil(route, {
    ok: true,
    stories: [],
    albums: [],
    count: 0,
    mine: true,
  });
});
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: new URL(route.request().url()).searchParams.get('chat'),
    kind: 'user',
    title: 'Numeric-only contact',
    username: null,
    phone: null,
  })
);
const pendingReads = [];
const release = () => pendingReads.splice(0).forEach((resume) => resume());
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
      pendingReads.push(resolve);
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
  globalThis.__historyPanels = [];
  const observer = new globalThis.MutationObserver(() => {
    const panel = globalThis.document.querySelector(
      '.chat-history-status, [data-history-status]'
    );
    if (panel) {
      globalThis.__historyPanels.push(panel.textContent);
    }
  });
  observer.observe(globalThis.document, { childList: true, subtree: true });
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignSkin', 't3');
});
const assertNoHistoryPanels = async () => {
  assert(
    (await page
      .locator('.chat-history-status, [data-history-status]')
      .count()) === 0,
    'no loading or background-history panel'
  );
  assert(
    (await page.locator('.chat-main > .chat-older').count()) === 0,
    'the compact marker lives inside scrolling messages'
  );
  assert(
    (await page
      .getByRole('button', { name: 'Load earlier', exact: true })
      .count()) === 0,
    'no manual history button'
  );
};
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
const optionalStoriesSteps = async () => {
  assert(
    storiesRequested === 0 && profileStoriesRequested === 0,
    'no stories requests by default, including profiles'
  );
  assert(
    (await page.locator('[data-stories], [data-profile-stories]').count()) ===
      0,
    'no stories surface by default'
  );
  await page.locator('button[data-view="settings"]').click();
  const choice = page.locator('[data-action="stories-enabled"]');
  assert(!(await choice.isChecked()), 'Stories setting defaults off');
  await choice.check();
  await page.locator('button[data-view="chat"]').click();
  await page.locator('[data-stories]').waitFor();
  assert(storiesRequested > 0, 'explicit opt-in loads stories');
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('[data-profile-stories]').waitFor();
  assert(
    profileStoriesRequested > 0,
    'profile stories are available after opt-in'
  );
  await page.locator('button[data-view="settings"]').click();
  await choice.uncheck();
  const count = storiesRequested;
  const profiles = profileStoriesRequested;
  await page.locator('button[data-view="chat"]').click();
  await page.reload();
  await page.locator('.chat-composer').waitFor();
  assert(
    (await page.locator('[data-stories]').count()) === 0,
    'off choice survives reload'
  );
  assert(
    storiesRequested === count && profileStoriesRequested === profiles,
    'disabled stories stop requests'
  );
};
const spacingSteps = async () => {
  await assertControlSpacing(page);
  await page.locator('[data-action="chat-about"]').click();
  await assertControlSpacing(page);
  await page.locator('button[data-view="settings"]').click();
  await assertControlSpacing(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertControlSpacing(page);
  assert(
    await page.locator('[data-action="stories-enabled"]').isVisible(),
    'settings fit a narrow viewport'
  );
};
await finish(async () => {
  await page.goto(`${base}/#chat=telegram:42`);
  assert(
    await page.evaluate(
      () =>
        globalThis.performance.getEntriesByType('navigation')[0]
          .nextHopProtocol === 'h2'
    ),
    'browser negotiated HTTP/2'
  );
  await page.locator('[data-row="msg:telegram:42:50"]').waitFor();
  const status = page.locator('.chat-scroll [data-older]');
  await page.locator('.chat-scroll [data-older="loading"]').waitFor();
  await assertNoHistoryPanels();
  assert(
    await status.locator('.spinner').isVisible(),
    'only an in-list spinner indicates a pending request'
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
  await page.locator('.chat-scroll [data-older="waiting"]').waitFor();
  await assertNoHistoryPanels();
  assert(
    (await status.getAttribute('title')).includes('Telegram asked to wait'),
    `the waiting icon explains itself on hover: ${await status.getAttribute('title')}`
  );
  assert(
    (await status.locator('.spinner').count()) === 0,
    'a wait never pretends to be an active request'
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
  assert(
    (await details.locator('.person-open-telegram').getAttribute('href')) ===
      'https://web.telegram.org/a/#42',
    'numeric peer opens its exact Telegram Web conversation'
  );
  assert(
    (await details.locator('.person-open-telegram').textContent()) ===
      'Open in Telegram Web',
    'numeric-only fallback is clearly labeled'
  );
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
  await optionalStoriesSteps();
  await spacingSteps();
  await assertNoHistoryPanels();
  assert(
    (await page.evaluate(() => globalThis.__historyPanels)).length === 0,
    'no history panel flashed during any phase'
  );
});
