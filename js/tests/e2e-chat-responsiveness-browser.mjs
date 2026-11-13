import { requestBody } from './helpers/http-wire.mjs';
// Small deterministic UI fixture: bounded rows and feedback before a held send.
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { verifyDirectoryHome } from './helpers/e2e-directory-focus.mjs';
import { directoryStore } from './helpers/directory-store.mjs';

const store = await directoryStore();
let release;
const heldSend = new Promise((resolve) => {
  release = resolve;
});
let started = false;
let releaseInfo;
let infoStarted = false;
const heldInfo = new Promise((resolve) => {
  releaseInfo = resolve;
});
const { page, base, until, finish } = await openChatApp('chat-responsiveness', {
  store,
  send: async () => {
    started = true;
    await heldSend;
    return { via: 'fixture' };
  },
});
if (process.env.CI_BROWSER_DEBUG === '1') {
  await page.addInitScript(() => {
    globalThis.metaSovereignDebug = true;
  });
  page.on('console', (message) => {
    if (message.text().startsWith('[ms-debug] chat_directory_focus')) {
      console.log(message.text());
    }
  });
}
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
});
await page.route('**/api/telegram/chat-info*', async (route) => {
  if (new URL(route.request().url()).searchParams.get('chat') === '2') {
    infoStarted = true;
    await heldInfo;
  }
  return fulfil(route, { kind: 'user', title: null });
});

let prefetched = 0;
page.on('request', (request) => {
  if (
    request.url().endsWith('/api/telegram/history') &&
    requestBody(request)?.priority === 'prefetch'
  ) {
    prefetched++;
  }
});
await finish(async () => {
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/#chat=telegram:1`);
    await page.locator('[data-row="msg:telegram:1:1"]').waitFor();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          )
        )
    );
    assert(prefetched === 0, 'hidden phone sidebar does not prefetch chats');
    await page.setViewportSize({ width: 1200, height: 800 });
    await until(
      () => prefetched > 0,
      'visible directory prefetches nearby chats'
    );
    const list = page.locator('.chat-list');
    const rows = list.locator('[data-chat]');
    await rows.first().waitFor();
    await page.locator('[data-row="msg:telegram:1:1"]').waitFor();
    assert(
      (await rows.count()) < 60,
      'initial directory renders only the viewport'
    );
    await list.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await until(
      () => list.locator('[data-chat="telegram:150"]').isVisible(),
      'end of directory is reachable'
    );
    assert((await rows.count()) < 60, 'scrolling does not retain earlier rows');
    assert(
      (await list.locator('[data-chat="telegram:1"]').count()) === 0,
      'offscreen rows are unmounted'
    );
    await verifyDirectoryHome(page, until);
    await list.locator('[data-chat="telegram:2"]').click();
    await until(() => infoStarted, 'provider metadata is held');
    await until(
      async () =>
        (await page.locator('.chat-header strong').textContent()) ===
        'Contact 2',
      'selection responds without waiting for provider metadata'
    );
    releaseInfo();
    await page.locator('[data-row="msg:telegram:2:1"]').waitFor();
    const input = page.locator('.chat-composer textarea');
    await input.fill('Immediate feedback');
    await input.press('Enter');
    await until(() => started, 'fixture send is held');
    assert(
      (await input.inputValue()) === '',
      'send clears the composer before acknowledgement'
    );
    await page.locator('[data-row^="pending:"]').waitFor();
    const pendingRow = list.locator('[data-chat="telegram:2"]');
    assert(
      (await pendingRow.locator('.chat-item-preview').textContent()).includes(
        'Immediate feedback'
      ),
      'directory preview updates while network acknowledgement is held'
    );
    assert(
      (await pendingRow.locator('[data-chat-delivery="sending"]').count()) ===
        1,
      'pending send has an honest status'
    );
    release();
    await until(
      async () => (await page.locator('[data-row^="pending:"]').count()) === 0,
      'confirmed echo replaces the pending bubble'
    );
    assert(
      (await pendingRow.locator('.chat-item-preview').textContent()).includes(
        'Immediate feedback'
      ),
      'confirmed preview stays visible'
    );
    assert(
      (await pendingRow.locator('[data-chat-delivery]').count()) === 0,
      'acknowledged send loses its pending status'
    );
    const search = page.locator('.chat-search');
    await search.fill('Contact 150');
    await until(
      () => list.locator('[data-chat="telegram:150"]').isVisible(),
      'search resets the viewport and shows matching chats'
    );
    await search.fill('');
    await page.locator('.chat-sort').selectOption('oldest');
    await until(
      () => list.locator('[data-chat="telegram:150"]').isVisible(),
      'oldest-first grouping remains navigable'
    );
    assert(
      (await list.locator('.chat-list-heading').count()) > 0,
      'date headings share the measured window'
    );
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '18px';
    });
    await until(
      () => list.locator('[data-chat="telegram:150"]').isVisible(),
      'scaled rows remain reachable after resizing'
    );
    await until(
      () =>
        list.locator('.chat-list-slot').evaluateAll((nodes) => {
          const rects = nodes.map((node) => {
            const { top, bottom } = node.getBoundingClientRect();
            return { top, bottom };
          });
          return rects.every(
            (rect, i) => i === 0 || rect.top >= rects[i - 1].bottom - 0.5
          );
        }),
      'measured slots align after the resize frame'
    );
  } finally {
    release();
    releaseInfo();
  }
});
