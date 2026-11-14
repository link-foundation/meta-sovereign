import assert from 'node:assert/strict';
import { browserOf } from './helpers/e2e-chat.mjs';
import { startBrowserMergeFixture } from './helpers/browser-merge-fixture.mjs';

const before = process.env.SNAPSHOT_BEFORE;
const trace = process.env.BROWSER_MERGE_TRACE === '1';
const { browserType, engine } = await browserOf('browser-merge');
const fixture = await startBrowserMergeFixture({ before });
let browser;
try {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const pages = [await context.newPage(), await context.newPage()];
  const errors = [];
  for (const page of pages) {
    if (trace) {
      page.on('console', (message) =>
        console.log('[snapshot]', message.text())
      );
    }
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
      async ({ name, kind, side, trace }) => {
        const m = await import(`/${side}.js`);
        const driver =
          kind === 'indexedDB'
            ? m.createIndexedDbDriver({ dbName: name })
            : m.createLocalStorageDriver(globalThis.localStorage, name);
        await globalThis.snapshotStore?.close?.();
        globalThis.snapshotErrors = [];
        globalThis.snapshotStore = await m.openCausalBrowserStore({
          driver: {
            ...driver,
            async save(...args) {
              const held = globalThis.snapshotWriteHold;
              if (held) {
                globalThis.snapshotWriteAdmitted = true;
                await held;
              }
              try {
                return await driver.save(...args);
              } catch (error) {
                if (trace) {
                  // Fixture diagnostics omit all snapshot payloads and revisions.
                  console.log(JSON.stringify({ kind, saveError: error.code }));
                }
                throw error;
              }
            },
          },
          onError: (error) => globalThis.snapshotErrors.push(error.code),
        });
      },
      { name, kind, side: before ? 'before' : 'after', trace }
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
  await concurrentEdits(pages);
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
  await replaceObservedChildren(pages, waitRecord);
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
      observedReplacementRetained: true,
      deletionRetained: true,
      privateLocal: true,
      durableReload: true,
    })
  );
}

async function concurrentEdits(pages) {
  // Admit both owner assignments before either root can commit. Concurrent
  // Playwright calls alone do not prevent a peer refresh before the later put.
  await Promise.all(
    pages.map((page) =>
      page.evaluate(() => {
        globalThis.snapshotWriteAdmitted = false;
        globalThis.snapshotWriteHold = new Promise((resolve) => {
          globalThis.snapshotReleaseWrite = () => {
            globalThis.snapshotWriteHold = null;
            resolve();
          };
        });
      })
    )
  );
  const edits = pages.map((page, index) =>
    page.evaluate(
      (index) =>
        globalThis.snapshotStore.put({
          id: 'shared',
          body: `concurrent-${index}`,
          children: [`child-${index}`],
        }),
      index
    )
  );
  // Observe every rejection immediately, including failures during cleanup.
  const finished = Promise.allSettled(edits);
  let results;
  try {
    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(() => globalThis.snapshotWriteAdmitted, null, {
          timeout: 5000,
        })
      )
    );
    // Both assignments are now concurrent. Commit one before releasing the
    // other to exercise stale-root merging without unrelated lock contention.
    await pages[0].evaluate(() => globalThis.snapshotReleaseWrite());
    await edits[0];
  } finally {
    await Promise.allSettled(
      pages.map((page) =>
        page.evaluate(() => globalThis.snapshotReleaseWrite())
      )
    );
    results = await finished;
  }
  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }
}

async function replaceObservedChildren(pages, waitRecord) {
  // A later owner assignment can deliberately replace its observed children.
  // An unchanged peer must follow that record, without reviving old children.
  await pages[1].evaluate(() =>
    globalThis.snapshotStore.put({
      id: 'shared',
      body: 'observed replacement',
      children: ['replacement'],
    })
  );
  await waitRecord(pages[0], 'shared', 'observed replacement');
  assert.deepEqual(
    await pages[0].evaluate(() => globalThis.snapshotStore.get('shared')),
    await pages[1].evaluate(() => globalThis.snapshotStore.get('shared'))
  );
  assert.deepEqual(
    await pages[0].evaluate(
      async () => (await globalThis.snapshotStore.get('shared')).children
    ),
    ['replacement']
  );
}
