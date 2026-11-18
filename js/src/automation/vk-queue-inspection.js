import {
  readVkOutgoingSettings,
  saveVkOutgoingSettings,
  VK_OUTGOING_PREFIX,
} from './vk-outgoing-settings.js';
import { inspectVkOutgoingRuntime } from './vk-queue-registry.js';

// Stream the store and retain at most 50 receipts and 50 peer states.
const recent = async (store, prefix, time) => {
  const rows = [];
  let total = 0;
  const accept = (batch) => {
    total += batch.length;
    rows.push(...batch);
    rows.sort(
      (a, b) =>
        String(b[time]).localeCompare(String(a[time])) ||
        a.id.localeCompare(b.id)
    );
    rows.splice(50);
  };
  const filter = (row) => row.id.startsWith(prefix) && row.source === 'vk';
  if (store.scan) {
    await store.scan(filter, 32, accept);
  } else {
    accept(await store.query(filter));
  }
  return { rows, total };
};
export const loadVkSendQueue = async (store) => {
  const runtime = inspectVkOutgoingRuntime(store);
  const queue = await recent(store, VK_OUTGOING_PREFIX, 'startedAt');
  const peers = await recent(store, 'automation-peer-state:', 'lastTriggered');
  const items = [];
  for (const row of queue.rows) {
    const outbox = row.outboxId ? await store.get(row.outboxId) : null;
    items.push({
      ...row,
      status:
        ['pacing', 'ready'].includes(row.status) && row.id !== runtime?.active
          ? 'interrupted'
          : row.status,
      delivery: outbox?.status ?? 'not-started',
    });
  }
  return {
    ok: true,
    settings: await readVkOutgoingSettings(store),
    runtime,
    items,
    total: queue.total,
    peers: peers.rows,
    peerTotal: peers.total,
  };
};
export const saveVkSendQueue = async (store, settings) => {
  await saveVkOutgoingSettings(store, settings);
  return loadVkSendQueue(store);
};
