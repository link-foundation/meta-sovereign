import assert from 'node:assert/strict';
import { browserOf } from './helpers/e2e-chat.mjs';
import { startSnapshotFixture } from './helpers/browser-storage-fixture.mjs';

const { browserType, engine } = await browserOf('browser-storage');
const fixture = await startSnapshotFixture();
let browser;
try {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const errors = [];
  for (const page of pages) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(fixture.url);
  }
  for (const kind of ['indexedDB', 'localStorage']) {
    await checkTabs(pages, kind);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`[e2e-browser-storage] OK (${engine})`);
} finally {
  try {
    await browser?.close();
  } finally {
    await fixture.close();
  }
}

async function checkTabs(pages, kind) {
  const name = `snapshot-${kind}-${globalThis.crypto.randomUUID()}`;
  const open = (page) =>
    page.evaluate(
      async ({ name, kind }) => {
        const m = await import('/after.js');
        const driver =
          kind === 'indexedDB'
            ? m.createIndexedDbDriver({ dbName: name })
            : m.createLocalStorageDriver(globalThis.localStorage, name);
        globalThis.snapshotStore = await m.createBrowserStore({ driver });
      },
      { name, kind }
    );
  // Both tabs load the same empty root before either commits. Real separate
  // database connections/Web Locks must serialize comparison and replacement.
  for (const page of pages) {
    await open(page);
  }
  const writes = await Promise.all(
    pages.map((page, index) =>
      page.evaluate(async (index) => {
        try {
          await globalThis.snapshotStore.put({
            id: `tab-${index}`,
            body: `draft-${index}`,
          });
          return { saved: true };
        } catch (error) {
          return { saved: false, code: error.code };
        }
      }, index)
    )
  );
  assert.equal(
    writes.filter((write) => write.saved).length,
    1,
    `${kind}: exactly one durable winner`
  );
  const loser = writes.findIndex((write) => !write.saved);
  const winner = 1 - loser;
  assert.ok(
    ['STORE_SNAPSHOT_CHANGED', 'STORE_SNAPSHOT_BUSY'].includes(
      writes[loser].code
    )
  );
  const pending = await pages[loser].evaluate(async () => {
    try {
      await globalThis.snapshotStore.flush();
      return { overwritten: true };
    } catch (error) {
      return {
        code: error.code,
        drafts: await globalThis.snapshotStore.query(),
      };
    }
  });
  assert.equal(pending.code, 'STORE_SNAPSHOT_CHANGED');
  assert.equal(
    pending.drafts[0].body,
    `draft-${loser}`,
    'retain unsaved owner changes'
  );
  await pages[loser].reload();
  await open(pages[loser]);
  const recovered = await pages[loser].evaluate(async () => {
    const records = await globalThis.snapshotStore.query();
    await globalThis.snapshotStore.put({ id: 'fresh', body: 'after reload' });
    return records;
  });
  assert.deepEqual(
    recovered.map((record) => record.id),
    [`tab-${winner}`]
  );
  // The first tab is now stale too: delete and flush must not erase fresh data.
  const removal = await pages[winner].evaluate(async (winner) => {
    try {
      await globalThis.snapshotStore.delete(`tab-${winner}`);
      return null;
    } catch (error) {
      return error.code;
    }
  }, winner);
  assert.equal(removal, 'STORE_SNAPSHOT_CHANGED');
  await pages[winner].reload();
  await open(pages[winner]);
  const final = await pages[winner].evaluate(() =>
    globalThis.snapshotStore.query()
  );
  assert.deepEqual(
    final.map((record) => record.id).sort(),
    ['fresh', `tab-${winner}`].sort()
  );
  console.log(
    '[browser-storage-ownership]',
    JSON.stringify({
      kind,
      twoTabs: true,
      oneWinner: true,
      pendingRetained: true,
      staleDeleteRefused: true,
      durableReload: true,
    })
  );
}
