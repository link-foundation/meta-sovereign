// Temporary outages keep loading, keep queued sends, and recover in any view.
import { createMemoryStore } from '../src/storage/universal.js';
import { OUTBOX_KEY } from '../src/web/chat-outbox.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:777:1',
  source: 'telegram',
  chat: '777',
  chatName: 'Recovery fixture',
  chatType: 'personal_chat',
  sender: '777',
  senderName: 'Recovery fixture',
  body: 'Context',
  timestamp: new Date().toISOString(),
  raw: { id: 1 },
});
const sent = [];
const { base, page, until, finish } = await openChatApp('recovery', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});
let blocked = false;
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  return blocked &&
    url.origin === base &&
    (/^\/api\//.test(url.pathname) || url.pathname === '/links')
    ? route.abort('failed')
    : route.fallback();
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
});
const checkProviderRetry = async () => {
  let historyAttempts = 0;
  await page.route('**/api/telegram/history', (route) => {
    historyAttempts += 1;
    return route.fulfill({
      status: historyAttempts < 3 ? 502 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        historyAttempts < 3
          ? {
              ok: false,
              code: 'network',
              error: 'temporary upstream interruption',
            }
          : { written: 0, cached: true, complete: true }
      ),
    });
  });
  await page.evaluate(() => {
    globalThis.__healthyHistoryLoaded = false;
    globalThis.__msApi
      .telegramHistory({ chat: '777', before: '99' })
      .then(() => {
        globalThis.__healthyHistoryLoaded = true;
      });
  });
  await until(() => historyAttempts > 0, 'background POST starts');
  await page.locator('.mode-badge.online').waitFor();
  assert(
    (await page.locator('[data-banner="api-error"]').count()) === 0,
    'a healthy local server and a retrying provider read never produce contradictory error UI'
  );
  await until(
    () => page.evaluate(() => globalThis.__healthyHistoryLoaded),
    'background POST resumes automatically while server stays online'
  );
  assert(historyAttempts === 3, 'temporary provider failures are retried');
};

await finish(async () => {
  await page.goto(base);
  await page.locator('[data-chat="telegram:777"]').click();
  await page.locator('.chat-composer textarea').waitFor();
  const centers = await page.locator('.chat-sidebar-top').evaluate((node) =>
    [...node.children].map((child) => {
      const box = child.getBoundingClientRect();
      return {
        name: child.className,
        center: box.y + box.height / 2,
        height: box.height,
      };
    })
  );
  assert(
    Math.max(...centers.map((x) => x.center)) -
      Math.min(...centers.map((x) => x.center)) <
      1,
    'toolbar controls share a vertical center'
  );
  assert(
    centers.every((item) => Math.abs(item.height - centers[0].height) < 1),
    'toolbar controls share a height'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }

  blocked = true;
  await page.evaluate(() => {
    globalThis.__recoveredLoads = {};
    for (const [name, load] of [
      ['backups', () => globalThis.__msApi.listBackups()],
      ['contacts', () => globalThis.__msApi.contacts()],
      ['history', () => globalThis.__msApi.telegramHistory({ chat: '777' })],
    ]) {
      load().then((value) => {
        globalThis.__recoveredLoads[name] = value;
      });
    }
  });
  await page.locator('.chat-composer textarea').fill('Queued fixture response');
  await page.locator('.chat-composer textarea').press('Enter');
  await page.locator('.bubble-waiting').waitFor();
  const clientId = await page.evaluate(
    (key) => JSON.parse(globalThis.localStorage.getItem(key))[0].clientId,
    OUTBOX_KEY
  );
  await page.evaluate(async () => {
    await globalThis.__msApi.status();
    await globalThis.__msApi.status();
  });
  await page.locator('.mode-badge.reconnecting').waitFor();
  assert(
    (await page.locator('.web-mode-banner').count()) === 0,
    'a known server is never described as first-time browser-only setup'
  );
  assert(sent.length === 0, 'failed attempts do not send');
  assert(
    (await page.locator('[data-banner="api-error"]').count()) === 0,
    'transport failures never raise a global error toast'
  );
  assert(
    Object.keys(await page.evaluate(() => globalThis.__recoveredLoads))
      .length === 0,
    'server-backed reads stay pending during the interruption'
  );

  await page.locator('button[data-view="settings"]').click();
  const offer = page.locator('[data-action="offer-browser-only"]');
  assert(!(await offer.isChecked()), 'browser-only offer defaults off');
  await offer.check();
  await page.locator('.web-mode-banner').waitFor();
  await offer.uncheck();
  await page.locator('.web-mode-banner').waitFor({ state: 'detached' });
  await page.locator('button[data-view="profile"]').click();
  blocked = false;
  await page.evaluate(() => globalThis.__msApi.health());
  await until(
    () => sent.length === 1,
    'queued send resumes automatically outside Chat'
  );
  await until(
    async () =>
      Object.keys(await page.evaluate(() => globalThis.__recoveredLoads))
        .length === 3,
    'GET, POST history, and contacts resume without manual action'
  );
  assert(
    (await page.locator('[data-banner="api-error"]').count()) === 0,
    'recovery leaves no stale error toast'
  );
  assert(
    sent[0].clientId === clientId,
    'recovery retains the same idempotency key'
  );
  await until(
    async () =>
      (await page.evaluate(
        (key) => JSON.parse(globalThis.localStorage.getItem(key)).length,
        OUTBOX_KEY
      )) === 0,
    'confirmed send leaves the durable queue'
  );
  await page.waitForTimeout(1200);
  assert(sent.length === 1, 'one queued message produces one send');
  await page.locator('main[data-view="profile"]').waitFor();

  await checkProviderRetry();

  await page.evaluate(() => {
    globalThis.__contactAttempts = 0;
    const original = globalThis.__msApi.contacts;
    globalThis.__msApi.contacts = async () => {
      if (++globalThis.__contactAttempts < 4) {
        throw new Error('temporary fixture outage');
      }
      return original();
    };
  });
  await page.locator('button[data-view="contacts"]').click();
  await page.locator('main[data-view="contacts"] .page-loading').waitFor();
  assert(
    (await page.locator('[data-action="load-retry"]').count()) === 0,
    'loading never requires a manual retry'
  );
  await until(
    async () =>
      (await page.evaluate(() => globalThis.__contactAttempts)) >= 4 &&
      (await page
        .locator('main[data-view="contacts"] .page-loading')
        .count()) === 0,
    'repeated failures recover without user input'
  );
});
