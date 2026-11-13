import { assert } from './e2e-chat.mjs';
import { readSyncPeer } from './e2e-lino-sync-read.mjs';

export const checkCausalWrites = async ({ page, other, until, link }) => {
  const before = await page.evaluate(
    (id) => globalThis.__msApi.get(id),
    link.id
  );
  assert(
    before?.vc && Object.values(before.vc).some((n) => n > 0),
    'ordinary browser put has a causal clock'
  );
  // Deliberately lower than the original Unicode body under payload tie order.
  const next = await page.evaluate(
    (value) =>
      globalThis.__msApi.put({ ...value, body: '00 later ordinary edit' }),
    link
  );
  assert(
    Object.values(next.vc).reduce((n, v) => n + v, 0) >
      Object.values(before.vc).reduce((n, v) => n + v, 0),
    'ordinary edit advances its observed clock'
  );
  await until(
    async () =>
      (await readSyncPeer(other, link.id))?.record?.body === next.body,
    'causal ordinary browser edit',
    20000
  );
  console.log(
    '[causal-writes]',
    JSON.stringify({ ordinary: true, advanced: true, remote: true })
  );
};
