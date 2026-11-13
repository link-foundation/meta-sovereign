import assert from 'node:assert/strict';
import { browserOf } from './helpers/e2e-chat.mjs';
import { startBrowserMergeFixture } from './helpers/browser-merge-fixture.mjs';

const before = process.env.SNAPSHOT_BEFORE;
const { browserType, engine } = await browserOf('browser-merge');
const fixture = await startBrowserMergeFixture({ before });
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
    await checkTabs(pages, kind);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`[e2e-browser-merge] OK (${engine})`);
} finally {
  try {
    await browser?.close();
  } finally {
    await fixture.close();
  }
}

async function checkTabs(pages, kind) {
  const name = `merge-${kind}-${globalThis.crypto.randomUUID()}`;
  const open = (page) =>
    page.evaluate(
      async ({ name, kind, side }) => {
        const m = await import(`/${side}.js`);
        const driver =
          kind === 'indexedDB'
            ? m.createIndexedDbDriver({ dbName: name })
            : m.createLocalStorageDriver(globalThis.localStorage, name);
        await globalThis.snapshotStore?.close?.();
        globalThis.snapshotErrors = [];
        globalThis.snapshotStore = await m.openCausalBrowserStore({
          driver,
          onError: (error) => globalThis.snapshotErrors.push(error.code),
        });
      },
      { name, kind, side: before ? 'before' : 'after' }
    );
  // The parent is opened sequentially so this regression reaches owner writes
  // rather than failing earlier on its competing empty-schema boot.
  if (before) {
    for (const page of pages) {
      await open(page);
    }
  } else {
    await Promise.all(pages.map(open));
  }
  const writes = await Promise.all(
    pages.map((page, index) =>
      page.evaluate(async (index) => {
        try {
          await globalThis.snapshotStore.put({
            id: `tab-${index}`,
            body: `owner-${index}`,
          });
          return { saved: true };
        } catch (error) {
          return { saved: false, code: error.code };
        }
      }, index)
    )
  );
  assert.deepEqual(
    writes,
    [{ saved: true }, { saved: true }],
    `${kind}: both editable tabs must save`
  );
  const waitRecord = (page, id, body) =>
    page.waitForFunction(
      async ({ id, body }) =>
        (await globalThis.snapshotStore.get(id))?.body === body,
      { id, body },
      { timeout: 5000 }
    );
  await Promise.all([
    waitRecord(pages[0], 'tab-1', 'owner-1'),
    waitRecord(pages[1], 'tab-0', 'owner-0'),
  ]);
  await pages[0].evaluate(() =>
    globalThis.snapshotStore.put({ id: 'shared', body: 'baseline' })
  );
  await waitRecord(pages[1], 'shared', 'baseline');
  await Promise.all(
    pages.map((page, index) =>
      page.evaluate(
        (index) =>
          globalThis.snapshotStore.put({
            id: 'shared',
            body: `concurrent-${index}`,
            children: [`child-${index}`],
          }),
        index
      )
    )
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        async () =>
          (await globalThis.snapshotStore.get('shared'))?.children?.length ===
          2,
        null,
        { timeout: 5000 }
      )
    )
  );
  assert.deepEqual(
    await pages[0].evaluate(() => globalThis.snapshotStore.get('shared')),
    await pages[1].evaluate(() => globalThis.snapshotStore.get('shared'))
  );
  await pages[0].evaluate(() => globalThis.snapshotStore.delete('shared'));
  await pages[1].waitForFunction(
    async () => (await globalThis.snapshotStore.get('shared')) === null,
    null,
    { timeout: 5000 }
  );
  await pages[1].evaluate(() =>
    globalThis.snapshotStore.put({
      id: 'secret:local',
      body: 'same-root private value',
    })
  );
  await waitRecord(pages[0], 'secret:local', 'same-root private value');
  await pages[0].reload();
  await open(pages[0]);
  const records = await pages[0].evaluate(() =>
    globalThis.snapshotStore.query()
  );
  assert.deepEqual(records.map((record) => record.id).sort(), [
    'meta:schema',
    'secret:local',
    'tab-0',
    'tab-1',
  ]);
  for (const page of pages) {
    assert.deepEqual(await page.evaluate(() => globalThis.snapshotErrors), []);
    await page.evaluate(() => globalThis.snapshotStore.close());
  }
  console.log(
    '[browser-tab-merge]',
    JSON.stringify({
      kind,
      bothSaved: true,
      liveRefresh: true,
      editsConverged: true,
      deletionRetained: true,
      privateLocal: true,
      durableReload: true,
    })
  );
}
