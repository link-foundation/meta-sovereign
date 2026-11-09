// Exercise the real handler without credentials, a server or external writes.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/universal.js';
import { broadcastHandler } from '../js/src/handlers/index.js';

const store = createMemoryStore();
const link = {
  id: 'broadcast:example',
  networks: ['x', 'vk'],
  body: 'Reviewed release announcement',
  status: 'queued',
};
const handler = broadcastHandler({
  broadcast: async () => [
    { network: 'x', ok: true, result: { id: 'example-post' } },
    { network: 'vk', ok: false, status: 'unknown', error: 'Response lost' },
  ],
});
await handler.run({ store, link });
const saved = await store.get(link.id);
assert.equal(saved.status, 'partial');
assert.deepEqual(saved.counts, { sent: 1, failed: 0, unknown: 1, queued: 0 });
console.log(JSON.stringify(saved, null, 2));
