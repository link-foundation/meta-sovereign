// Reload, history traversal and deep links share one route at every width.
import { createMemoryStore } from '../src/storage/universal.js';
import { navItems } from '../src/web/nav-items.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
for (const chat of ['111', '222']) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatType: 'personal_chat',
    chatName: `Person ${chat}`,
    sender: chat,
    body: 'Unread context',
    timestamp: new Date().toISOString(),
    raw: { id: 1 },
  });
  await store.put({
    id: `read:telegram:${chat}`,
    source: 'telegram',
    chat,
    unreadCount: 1,
    unreadTopId: 1,
    inboxMaxId: 0,
  });
}
const { page, base, until, finish } = await openChatApp('navigation', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.__visitedViews = [];
  new globalThis.MutationObserver(() => {
    const view = document.querySelector('main[data-view]')?.dataset.view;
    if (view && globalThis.__visitedViews.at(-1) !== view) {
      globalThis.__visitedViews.push(view);
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-view'],
  });
});
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = route.request().postDataJSON();
  return fulfil(route, {
    ok: true,
    read: await store.get(`read:telegram:${chat}`),
  });
});
const selected = (view) => page.locator(`main[data-view="${view}"]`).waitFor();
const pick = async (view) => {
  await page.locator(`button[data-view="${view}"]`).click();
  await selected(view);
  if (view === 'operator') {
    await page.locator('[data-operator-chat]').waitFor();
  }
};
const everySection = async () => {
  for (const [view] of navItems) {
    await pick(view);
    const hash = new URL(page.url()).hash;
    const length = await page.evaluate(() => globalThis.history.length);
    await pick(view);
    assert(
      (await page.evaluate(() => globalThis.history.length)) === length,
      `${view}: no duplicate menu history entry`
    );
    await page.reload();
    await selected(view);
    assert(new URL(page.url()).hash === hash, `${view}: URL survives reload`);
    assert(
      (await page.evaluate(() => globalThis.__visitedViews)).every(
        (item) => item === view
      ),
      `${view}: never flashes Chat on reload`
    );
  }
};
const historySteps = async () => {
  await pick('contacts');
  await pick('operator');
  await pick('settings');
  await page.goBack();
  await selected('operator');
  await page.goBack();
  await selected('contacts');
  await page.goForward();
  await selected('operator');
  await page.goForward();
  await selected('settings');
  await page.goBack();
  await selected('operator');
  await pick('calls');
  assert(
    !(await page.evaluate(
      () =>
        globalThis.history.state?.metaSovereignNavigation?.view === 'settings'
    )),
    'new navigation replaces the forward branch'
  );
};
const chatSteps = async () => {
  await pick('chat');
  await page.locator('[data-chat="telegram:111"]').click();
  await page.locator('[data-chat="telegram:222"]').click();
  await page.reload();
  await page.locator('[data-chat="telegram:222"].active').waitFor();
  await page.goBack();
  await page.locator('[data-chat="telegram:111"].active').waitFor();
  await pick('contacts');
  await page.evaluate(() => {
    globalThis.location.hash = '#chat=telegram:222';
  });
  await selected('chat');
  await page.locator('[data-chat="telegram:222"].active').waitFor();
};
const connectionSteps = async () => {
  await page.goto(`${base}/#conn-telegram/manual`);
  await selected('connections');
  await page.locator('section[data-provider="telegram"]').waitFor();
  await pick('operator');
  await page.goBack();
  await selected('connections');
  assert(
    new URL(page.url()).hash === '#conn-telegram/manual',
    'Back restores provider and mode'
  );
  await page.reload();
  await selected('connections');
  assert(
    new URL(page.url()).hash === '#conn-telegram/manual',
    'provider deep link survives reload'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="nav-more"]').click();
  await pick('operator');
  await page.reload();
  await selected('operator');
  await until(
    async () => (await page.locator('[data-operator-chat]').count()) === 1,
    'Operator works after mobile reload'
  );
};
const scrollSteps = async () => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await pick('settings');
  await page.evaluate(() => globalThis.scrollTo(0, 700));
  await until(
    async () => await page.evaluate(() => globalThis.scrollY >= 690),
    'settings scrolled'
  );
  await pick('contacts');
  await page.goBack();
  await selected('settings');
  await until(
    async () => await page.evaluate(() => globalThis.scrollY >= 690),
    'Back restores section scroll'
  );
  await page.reload();
  await selected('settings');
  await until(
    async () => await page.evaluate(() => globalThis.scrollY >= 690),
    'reload restores section scroll'
  );
};

await finish(async () => {
  await page.goto(base);
  await everySection();
  await historySteps();
  await chatSteps();
  await connectionSteps();
  await scrollSteps();
});
