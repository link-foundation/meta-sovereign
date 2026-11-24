import { assert } from './e2e-chat.mjs';
import { readSyncPeer } from './e2e-lino-sync-read.mjs';

export const checkSyncReconciliation = async ({
  page,
  other,
  base,
  until,
  store,
}) => {
  const removed = 'l:rtc-offline-removed';
  const edited = 'l:rtc-offline-edited';
  const fresh = 'l:rtc-offline-fresh';
  await page.evaluate(
    async ([removed, edited]) => {
      for (const id of [removed, edited]) {
        await globalThis.__msApi.put({ id, body: 'before disconnect' });
      }
    },
    [removed, edited]
  );
  await until(
    async () =>
      (await readSyncPeer(other, removed))?.record &&
      (await readSyncPeer(other, edited))?.record,
    'retain pre-disconnect browser records',
    20000
  );
  // This document is genuinely absent while the owner changes its store.
  // Its context keeps IndexedDB; existing init/route hooks run once on return.
  await other.goto('about:blank');
  await page.waitForFunction(
    () =>
      globalThis.__syncRtc.every((events) =>
        events.some((event) => event.event === 'disposed')
      ),
    null,
    { timeout: 20000 }
  );
  await page.evaluate(
    async ([removed, edited, fresh]) => {
      await globalThis.__msApi.del(removed);
      await globalThis.__msApi.put({
        id: edited,
        body: 'edited while peer absent',
      });
      await globalThis.__msApi.put({
        id: fresh,
        body: 'created while peer absent',
      });
    },
    [removed, edited, fresh]
  );
  await other.goto(`${base}/#settings`);
  await until(
    async () => {
      const deletion = await readSyncPeer(other, removed);
      return (
        deletion &&
        !deletion.record &&
        (await readSyncPeer(other, edited))?.record?.body ===
          'edited while peer absent' &&
        (await readSyncPeer(other, fresh))?.record?.body ===
          'created while peer absent'
      );
    },
    'native WebRTC catches offline records, edits and deletion clocks',
    20000
  );
  for (const id of [removed, edited, fresh]) {
    assert(
      !(await store.get(id)),
      'signaling does not persist offline application records'
    );
  }
  console.log(
    '[sync-reconciliation]',
    JSON.stringify({
      native: true,
      durableContext: true,
      absentPeer: true,
      created: true,
      edited: true,
      deleted: true,
    })
  );
};
