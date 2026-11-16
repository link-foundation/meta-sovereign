import assert from 'node:assert/strict';
import { waitForBrowserValue } from './browser-value.mjs';

export const checkBrowserBootQueue = async (pages, side = 'after') => {
  const name = `boot-${globalThis.crypto.randomUUID()}`;
  const [holder, owner] = pages;
  await holder.evaluate((name) => {
    globalThis.snapshotBootHeld = false;
    globalThis.snapshotBootHolding = globalThis.navigator.locks.request(
      `meta-sovereign:snapshot:${name}`,
      () =>
        new Promise((resolve) => {
          globalThis.snapshotBootRelease = resolve;
          globalThis.snapshotBootHeld = true;
        })
    );
  }, name);
  await holder.waitForFunction(() => globalThis.snapshotBootHeld, null, {
    timeout: 3000,
  });
  const opening = owner.evaluate(
    async ({ name, side }) => {
      const m = await import(`/${side}.js`);
      globalThis.snapshotBootQueued = false;
      globalThis.snapshotBootStore = await m.openCausalBrowserStore({
        driver: m.createLocalStorageDriver(globalThis.localStorage, name, {
          locks: {
            request(key, options, run) {
              globalThis.snapshotBootQueued =
                !options.ifAvailable && Boolean(options.signal);
              return globalThis.navigator.locks.request(key, options, run);
            },
          },
        }),
      });
    },
    { name, side }
  );
  const observed = Promise.allSettled([opening]);
  const queued = waitForBrowserValue(
    owner,
    async (name) =>
      globalThis.snapshotBootQueued &&
      (await globalThis.navigator.locks.query()).pending.some(
        (lock) => lock.name === `meta-sovereign:snapshot:${name}`
      ),
    name,
    1000
  );
  let results;
  try {
    await Promise.race([
      queued,
      opening.then(() => {
        throw new Error(
          'Browser startup resolved while its root lock was held'
        );
      }),
    ]);
  } finally {
    await holder.evaluate(async () => {
      globalThis.snapshotBootRelease();
      await globalThis.snapshotBootHolding;
    });
    results = await observed;
    await Promise.allSettled([queued]);
    await owner.evaluate(() => globalThis.snapshotBootStore?.close());
  }
  assert.equal(results[0].status, 'fulfilled');
  console.log(
    `[browser-boot-queue] ${JSON.stringify({
      queuedBehindNativeLock: true,
      savedAfterRelease: true,
      ownedResourcesClosed: true,
    })}`
  );
};
