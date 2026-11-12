import { assert } from './e2e-chat.mjs';
import { prepareSyncPeer, stopSyncPeer } from './e2e-sync-peer.mjs';
import { readSyncPeer } from './e2e-lino-sync-read.mjs';

/** Real third-peer admission, connected reload and surviving-pair regression. */
export const checkSyncMesh = async ({
  page,
  other,
  base,
  engine,
  until,
  store,
}) => {
  const context = await page.context().browser().newContext();
  const third = await context.newPage();
  const errors = [];
  third.on('pageerror', (error) => errors.push(error.message));
  const put = (target, id) =>
    target.evaluate(
      (key) => globalThis.__msApi.put({ id: key, body: key, tokens: [] }),
      id
    );
  const received = async (targets, id, absent = false) => {
    const records = await Promise.all(
      targets.map((target) => readSyncPeer(target, id))
    );
    return records.every(
      (value) => value && (absent ? !value.record : value.record?.body === id)
    );
  };
  try {
    await prepareSyncPeer(third, base, engine);
    const id = 'l:rtc-three-peers';
    await put(page, id);
    await until(
      () => received([other, third], id),
      'three peers retain distinct data channels',
      20000
    );
    const reverse = 'l:rtc-third-reverse';
    await put(third, reverse);
    await until(
      () => received([page, other], reverse),
      'third peer sends to both original peers',
      20000
    );
    const before = await other.evaluate(
      () => globalThis.performance.timeOrigin
    );
    await other.reload();
    await other.waitForFunction(
      () =>
        Boolean(
          globalThis.__msApi &&
          globalThis.__syncWire?.some(
            (frame) =>
              frame.rtc && frame.protocol === 'meta-sovereign-sync.lino.v2'
          )
        ),
      null,
      { timeout: 20000 }
    );
    const after = await other.evaluate(() => globalThis.performance.timeOrigin);
    assert(after !== before, 'replace a connected peer document');
    // A fresh ID avoids falsely accepting a record retained in IndexedDB.
    const fresh = 'l:rtc-after-connected-reload';
    await put(page, fresh);
    await until(
      () => received([other, third], fresh),
      'fresh writes after connected reload',
      20000
    );
    const reply = 'l:rtc-reloaded-reply';
    await put(other, reply);
    await until(
      () => received([page, third], reply),
      'reloaded peer sends to both surviving peers',
      20000
    );
    await page.evaluate((key) => globalThis.__msApi.del(key), id);
    await until(
      () => received([other, third], id, true),
      'delete through reconnected mesh'
    );
    for (const target of [other, third]) {
      assert(
        !(await readSyncPeer(target, fresh)).secret,
        'mesh excludes secrets'
      );
    }
    for (const key of [id, reverse, fresh, reply]) {
      assert(
        !(await store.get(key)),
        'signaling stores no application records'
      );
    }
    assert(errors.length === 0, 'third peer has no browser errors');
    await stopSyncPeer(third);
    await context.close();
    const survivor = 'l:rtc-after-third-departure';
    await put(other, survivor);
    await until(
      () => received([page], survivor),
      'a departure preserves the remaining pair',
      20000
    );
    console.log(
      '[lino-sync-mesh]',
      JSON.stringify({
        peers: 3,
        connectedReload: true,
        freshBidirectional: true,
        deletion: true,
        remainingPair: true,
        pageErrors: errors.length,
      })
    );
  } finally {
    if (!third.isClosed()) {
      await stopSyncPeer(third);
    }
    await context.close();
  }
};
