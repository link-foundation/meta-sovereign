// Native scrollbar hit areas and avatar read-ahead, on an isolated small fixture.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.putMany(
  Array.from({ length: 80 }, (_, i) => ({
    id: `msg:telegram:${i + 1}:1`,
    source: 'telegram',
    chat: String(i + 1),
    chatName: `Fixture ${i + 1}`,
    sender: String(i + 1),
    senderName: `Fixture ${i + 1}`,
    chatType: 'personal_chat',
    body: 'Fixture message',
    timestamp: new Date(Date.now() - i * 60_000).toISOString(),
  }))
);
const { page, base, until, finish } = await openChatApp('panels-avatars', {
  store,
  // Headless Chromium otherwise disables the native scrollbar being tested.
  launchOptions: {
    ignoreDefaultArgs: ['--hide-scrollbars'],
    env: { ...process.env, GTK_OVERLAY_SCROLLING: '0' },
  },
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
let active = 0;
let peak = 0;
let unavailablePeer = null;
let rejectedRefreshes = 0;
await page.route('**/api/telegram/avatar?**', async (route) => {
  peak = Math.max(peak, ++active);
  await new Promise((resolve) => setTimeout(resolve, 15));
  const unavailable =
    new URL(route.request().url()).searchParams.get('peer') === unavailablePeer;
  if (unavailable) {
    rejectedRefreshes++;
  }
  await route.fulfill({
    status: unavailable ? 503 : 200,
    contentType: 'image/png',
    body: unavailable ? '' : PNG,
  });
  active--;
});
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { kind: 'user', title: null })
);

const avatarSteps = async () => {
  const near = await page.locator('.chat-list').evaluate((list) => {
    const edge = list.getBoundingClientRect().bottom;
    return [...list.querySelectorAll('[data-chat]')].find((row) => {
      const box = row.getBoundingClientRect();
      return box.top > edge + 20 && box.top < edge + list.clientHeight / 2;
    })?.dataset.chat;
  });
  assert(near, 'fixture has an avatar below the visible viewport');
  const photo = page.locator(`[data-chat="${near}"] .peer-avatar img.shown`);
  await photo.waitFor({ state: 'attached' });
  assert(
    await photo.evaluate((node) => node.complete && node.naturalWidth > 0),
    'nearby avatar is decoded before scrolling into view'
  );
  assert(peak <= 2, `avatar downloads stay bounded (${peak})`);
  assert(
    (await page
      .locator('.peer-avatar .media-loading, .peer-avatar .spinner')
      .count()) === 0,
    'initials are a quiet fallback'
  );
  const list = page.locator('.chat-list');
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await until(
    () => page.locator('[data-chat="telegram:80"]').isVisible(),
    'scroll reaches the end'
  );
  await list.evaluate((node) => {
    node.scrollTop = 0;
  });
  await until(() => photo.count().then(Boolean), 'cached row is remounted');
  assert(
    (await photo.getAttribute('class')) === 'shown',
    'completed avatar does not fade from a placeholder on remount'
  );
  unavailablePeer = near.split(':').at(-1);
  // Force a real failed refresh; a plain remount may reuse the browser's
  // decoded image without making any HTTP request (the desired fast path).
  await photo.evaluate((node) => {
    node.src += '&fixture-failure=1';
  });
  await until(() => rejectedRefreshes > 0, 'a real avatar refresh is refused');
  await until(async () => {
    const avatar = page.locator(`[data-chat="${near}"] .peer-avatar`);
    return (
      (await avatar.count()) > 0 &&
      (await avatar
        .locator('img.shown')
        .evaluateAll((images) =>
          images.every((node) => node.complete && node.naturalWidth > 0)
        ))
    );
  }, 'a failed refresh retains initials or a valid cached photo, never a visible broken image');
};

const rightEdgeSteps = async (panel, content, splitter) => {
  await page.mouse.move(0, 0);
  const outer = await panel.boundingBox();
  const before = await content.boundingBox();
  const grip = await splitter.boundingBox();
  assert(
    Math.abs(grip.x - (outer.x + outer.width)) <= 1,
    'right resize hit area starts at the outer panel edge'
  );
  assert(
    (await panel.evaluate(
      (node) => globalThis.getComputedStyle(node).paddingRight
    )) === '0px',
    'no sidebar space is reserved for the handle'
  );
  assert(
    (await splitter.evaluate(
      (node) => globalThis.getComputedStyle(node).backgroundColor
    )) === 'rgba(0, 0, 0, 0)',
    'idle resize handle is transparent'
  );
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 100);
  assert(
    (await splitter.evaluate(
      (node) => globalThis.getComputedStyle(node).backgroundColor
    )) !== 'rgba(0, 0, 0, 0)',
    'hover reveals the handle outside the sidebar'
  );
  assert(
    JSON.stringify(await content.boundingBox()) === JSON.stringify(before) &&
      JSON.stringify(await panel.boundingBox()) === JSON.stringify(outer),
    'hover never shifts content or changes the panel width'
  );
  return grip;
};

const scrollbarSteps = async () => {
  await page.evaluate(() => {
    const sheet = globalThis.document.querySelector(
      'link[rel="stylesheet"]'
    ).sheet;
    for (const rule of [
      '.chat-list { overflow-y: scroll; scrollbar-gutter: stable; scrollbar-width: auto; }',
      '.chat-list::-webkit-scrollbar { width: 14px; }',
      '.chat-list::-webkit-scrollbar-thumb { background: #888; }',
    ]) {
      sheet.insertRule(rule, sheet.cssRules.length);
    }
  });
  const list = page.locator('.chat-list');
  const splitter = page.locator('[data-panel-divider="chats"]');
  const bar = await list.boundingBox();
  const grip = await rightEdgeSteps(
    page.locator('.chat-sidebar'),
    list,
    splitter
  );
  assert(
    bar.x + bar.width <= grip.x + 0.5,
    'scrollbar and resize hit areas do not overlap'
  );
  const width = (await page.locator('.chat-sidebar').boundingBox()).width;
  console.log(
    '[e2e-panels-avatars] scrollbar',
    await list.evaluate((node) => ({
      inset: node.offsetWidth - node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      width: globalThis.getComputedStyle(node).scrollbarWidth,
    }))
  );
  // GTK overlay scrollbars reveal their interactive track after pointer entry.
  await page.mouse.move(bar.x + bar.width - 3, bar.y + bar.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.click(bar.x + bar.width - 3, bar.y + bar.height - 25);
  await until(
    () => list.evaluate((node) => node.scrollTop > 0),
    'mouse click on native scrollbar scrolls the chat list'
  );
  assert(
    Math.abs(
      (await page.locator('.chat-sidebar').boundingBox()).width - width
    ) < 1,
    'scrollbar click never resizes the panel'
  );
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 100);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 32, grip.y + 100, {
    steps: 4,
  });
  await page.mouse.up();
  assert(
    (await page.locator('.chat-sidebar').boundingBox()).width > width + 20,
    'outside resize handle still drags'
  );
  await splitter.focus();
  await page.keyboard.press('Enter');
  const drawer = await page.locator('.permanent-drawer-items').boundingBox();
  const navGrip = await rightEdgeSteps(
    page.locator('.permanent-drawer'),
    page.locator('.permanent-drawer-items'),
    page.locator('[data-panel-divider="navigation"]')
  );
  assert(
    drawer.x + drawer.width <= navGrip.x + 0.5,
    'navigation scrollbar also stays outside the resize hit area'
  );
  const navWidth = (await page.locator('.permanent-drawer').boundingBox())
    .width;
  await page.mouse.move(navGrip.x + navGrip.width / 2, navGrip.y + 100);
  await page.mouse.down();
  await page.mouse.move(navGrip.x + navGrip.width / 2 + 24, navGrip.y + 100, {
    steps: 3,
  });
  await page.mouse.up();
  assert(
    (await page.locator('.permanent-drawer').boundingBox()).width >
      navWidth + 16,
    'navigation handle still resizes'
  );
  await page.locator('.chat-header [data-action="chat-about"]').click();
  await page.locator('.person-panel').waitFor();
  const detailsGrip = await page
    .locator('[data-panel-divider="details"]')
    .boundingBox();
  const body = await page.locator('.person-panel-body').boundingBox();
  assert(
    detailsGrip.x + detailsGrip.width <= body.x + 0.5,
    'profile controls stay beyond the resize gutter'
  );
  const detailsWidth = (await page.locator('.person-panel').boundingBox())
    .width;
  await page.locator('[data-panel-divider="details"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert(
    (await page.locator('.person-panel').boundingBox()).width > detailsWidth,
    'profile gutter remains keyboard accessible'
  );
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:1`);
  await page.locator('[data-row="msg:telegram:1:1"]').waitFor();
  await avatarSteps();
  await scrollbarSteps();
});
