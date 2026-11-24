// Real account routes and readable Lino, with bounded SDK fakes and no sends.
import {
  greetingDocument,
  greetingStickerFixture,
} from './helpers/greeting-stickers-fakes.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const fixture = greetingStickerFixture({
  now: () => Date.UTC(2026, 10, 10, 12),
});
const invoke = fixture.client.invoke;
let failed = false;
let held = null;
fixture.client.invoke = async (request) => {
  if (held && request.className === 'GetOldFeaturedStickers') {
    await held.promise;
  }
  if (failed) {
    throw new Error('provider unavailable');
  }
  if (request.className === 'GetRecentStickers') {
    return {
      stickers: Array.from({ length: 102 }, (_, i) =>
        greetingDocument(i + 100, i === 101 ? '🎂' : '👋')
      ),
    };
  }
  return invoke(request);
};
const { page, base, until, finish } = await openChatApp(
  'telegram-greeting-catalog',
  {
    store: fixture.store,
    telegramAccount: {
      ...fixture.catalog,
      stickerPanel: async () => ({ ok: true, recent: [], faved: [], sets: [] }),
      stickerSearch: async () => ({ ok: true, stickers: [], sets: [] }),
      callsList: async () => ({ ok: true, calls: [], next: null }),
      status: async () => ({ connected: true, kind: 'user' }),
      stop: fixture.env.greetingStickersStop,
    },
  }
);
await page.unroute('**/api/telegram/status');
page.setDefaultTimeout(8000);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=',
  'base64'
);
await page.route('https://vk.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: png })
);
const panel = page.locator('[data-telegram-catalog]');
const button = (name) => panel.locator(`[data-catalog-action="${name}"]`);
const field = (name) => panel.locator(`[data-catalog-field="${name}"]`);
const job = (state) => panel.locator(`[data-catalog-job="${state}"]`);
const items = panel.locator('[data-catalog-items] li');
await finish(async () => {
  try {
    await page.goto(`${base}/#/greetings`);
    await page.locator('[data-catalog-panel] > summary').click();
    await button('refresh').waitFor();
    assert(fixture.calls.length === 0, 'opening only reads the cache');
    await field('maxSets').fill('0');
    assert(
      await button('refresh').isDisabled(),
      'invalid bounds cannot refresh'
    );
    await field('maxSets').fill('1000');
    await button('refresh').click();
    await job('done').waitFor({ timeout: 8000 });
    assert(
      (await panel.locator('[data-catalog-count]').textContent()).includes(
        '104 greeting stickers in 105'
      ),
      'all source documents counted'
    );
    assert((await items.count()) === 100, 'bounded first page');
    await button('next').click();
    await until(async () => (await items.count()) === 4, 'next greeting page');
    await button('previous').click();
    await until(async () => (await items.count()) === 100, 'previous page');
    await field('greetingsOnly').click();
    await until(
      async () => !(await field('greetingsOnly').isChecked()),
      'filter read completed'
    );
    await button('next').click();
    await until(
      async () => (await items.count()) === 5,
      'unfiltered page includes non-greeting'
    );
    assert(
      (await items.allTextContents()).some((text) => text.includes('🎂')),
      'non-greeting retained separately'
    );
    await field('maxDocuments').fill('1');
    await button('refresh').click();
    await job('partial').waitFor({ timeout: 8000 });
    assert(
      (await panel.locator('[data-catalog-count]').textContent()).includes(
        '105'
      ),
      'bounded partial refresh preserves old documents'
    );
    await field('maxDocuments').fill('10000');
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    held = { promise, release };
    await button('refresh').click();
    await job('running').waitFor();
    await button('cancel').click();
    await job('cancelling').waitFor();
    release();
    held = null;
    await job('cancelled').waitFor({ timeout: 8000 });
    assert(
      (await panel.locator('[data-catalog-count]').textContent()).includes(
        '105'
      ),
      'cancelled refresh retains cache'
    );
    failed = true;
    await button('refresh').click();
    await job('failed').waitFor({ timeout: 8000 });
    assert(
      (await panel.locator('[data-catalog-coverage]').textContent()).includes(
        'Unavailable'
      ),
      'failed sources shown'
    );
    assert(
      (await panel.locator('[data-catalog-count]').textContent()).includes(
        '105'
      ),
      'failed refresh retains cache'
    );
    failed = false;
    await page.reload();
    await page.locator('[data-catalog-panel] > summary').click();
    await panel.locator('[data-catalog-count]').waitFor();
    assert(
      (await panel.locator('[data-catalog-count]').textContent()).includes(
        '105'
      ),
      'cache recovers after navigation'
    );
    await page.route('**/api/telegram/status', (route) =>
      fulfil(route, { kind: 'bot', connected: true, capabilities: {} })
    );
    await button('reload').click();
    await until(
      async () => (await button('refresh').count()) === 0,
      'unsupported bot has no refresh action'
    );
    assert(
      (await items.count()) === 0,
      'account capability loss clears previous results'
    );
    await page.unroute('**/api/telegram/status');
    await button('reload').click();
    await button('refresh').waitFor();
    assert((await items.count()) === 100, 'reconnected account cache recovers');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      (await page.evaluate(() => document.documentElement.scrollWidth)) === 390,
      'catalog fits mobile viewport'
    );
    assert(
      !fixture.calls.some((call) => call.className === 'SendMedia'),
      'discovery never sends a message'
    );
  } finally {
    // Release a deliberately held finite request even if a browser assertion fails.
    held?.release();
    held = null;
  }
});
