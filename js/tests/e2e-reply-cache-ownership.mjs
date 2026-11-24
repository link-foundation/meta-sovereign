import assert from 'node:assert/strict';
import { browserOf } from './helpers/e2e-chat.mjs';
import { startReplyCacheFixture } from './helpers/reply-cache-fixture.mjs';

const before = process.env.SNAPSHOT_BEFORE;
const { browserType, engine } = await browserOf('reply-cache-ownership');
const fixture = await startReplyCacheFixture({ before });
let browser;
try {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const pages = [await context.newPage(), await context.newPage()];
  const errors = [];
  for (const page of pages) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(fixture.url);
  }
  for (const kind of ['indexedDB', 'localStorage']) {
    await checkCache(pages, kind);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`[e2e-reply-cache-ownership] OK (${engine})`);
} finally {
  try {
    await browser?.close();
  } finally {
    await fixture.close();
  }
}

async function checkCache(pages, kind) {
  const name = `reply-ownership-${kind}-${globalThis.crypto.randomUUID()}`;
  const open = (page, version, key = name) =>
    page.evaluate(
      async ({ key, kind, version, side }) => {
        const m = await import(`/${side}.js`);
        await globalThis.replyCache?.close?.();
        const driver =
          kind === 'indexedDB'
            ? m.createIndexedDbDriver({ dbName: key })
            : m.createLocalStorageDriver(globalThis.localStorage, key);
        globalThis.replyDriver = driver;
        globalThis.replyErrors = [];
        globalThis.replyModel = version
          ? {
              version,
              self: ['me'],
              windowMs: 86_400_000,
              links: m
                .buildReplyIndex([
                  {
                    id: `msg:vk:${version}`,
                    source: 'vk',
                    chat: '1',
                    sender: 'friend',
                    body: version,
                    timestamp: new Date().toISOString(),
                  },
                ])
                .modelLinks(),
            }
          : null;
        globalThis.replyCache = m.createReplyCache({
          driver,
          fetchModel: async () => globalThis.replyModel,
          onError: (error) => globalThis.replyErrors.push(error.code),
        });
        await globalThis.replyCache.start();
      },
      { key, kind, version, side: before ? 'before' : 'after' }
    );
  await open(pages[0], 'alpha.0');
  await pages[0].evaluate(() => globalThis.replyCache.flush());
  await open(pages[1], 'alpha.2');
  await pages[1].evaluate(() => globalThis.replyCache.flush());
  // The parent keeps alpha.0 forever: it has no shared-root invalidation.
  await pages[0]
    .waitForFunction(
      () => globalThis.replyCache.version() === 'alpha.2',
      null,
      { timeout: 5000 }
    )
    .catch(async (error) => {
      const versions = await Promise.all(
        pages.map((page) =>
          page.evaluate(() => globalThis.replyCache.version())
        )
      );
      console.error(
        '[reply-cache-ownership] live peer versions',
        JSON.stringify(versions)
      );
      throw error;
    });
  assert.equal(
    await pages[0].evaluate(() =>
      globalThis.replyCache.toAnswer({ source: 'vk', chat: '1' })
    ),
    'alpha.2'
  );
  // Asking a stale source again cannot roll back this build's committed counts.
  await pages[0].evaluate(async () => {
    await globalThis.replyCache.sync();
    await globalThis.replyCache.flush();
  });
  assert.equal(
    await pages[0].evaluate(
      async () => (await globalThis.replyDriver.load()).links[0].version
    ),
    'alpha.2'
  );
  // An extra account must not load or broadcast this account's model.
  await open(pages[1], null, `${name}-other-account`);
  assert.equal(
    await pages[1].evaluate(() => globalThis.replyCache.ready()),
    false
  );
  await pages[0].reload();
  await open(pages[0], null);
  assert.equal(
    await pages[0].evaluate(() => globalThis.replyCache.version()),
    'alpha.2'
  );
  assert.equal(
    await pages[0].evaluate(() =>
      globalThis.replyCache.toAnswer({ source: 'vk', chat: '1' })
    ),
    'alpha.2'
  );
  for (const page of pages) {
    assert.deepEqual(await page.evaluate(() => globalThis.replyErrors), []);
    await page.evaluate(() => globalThis.replyCache.close());
  }
  console.log(
    '[reply-cache-ownership]',
    JSON.stringify({
      kind,
      liveRefresh: true,
      noRollback: true,
      offlineReload: true,
      accountIsolated: true,
    })
  );
}
