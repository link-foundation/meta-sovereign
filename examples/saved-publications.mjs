// Offline saved-destination lifecycle: dummy credentials, no HTTP or live account.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/universal.js';
import { saveTarget } from '../js/src/broadcast/targets.js';
import { saveBroadcastCredentials } from '../js/src/broadcast/credentials.js';
import { createPublicationService } from '../js/src/broadcast/service.js';

const store = createMemoryStore();
await saveBroadcastCredentials(store, 'telegram', {
  botToken: 'example-not-a-real-token',
});
for (const [id, kind, destination] of [
  ['news', 'channel', '@example_news'],
  ['team', 'group', '-10042'],
]) {
  await saveTarget(store, {
    id,
    label: id,
    network: 'telegram',
    kind,
    destination,
    format: 'html',
  });
}
let writes = 0;
const service = createPublicationService({
  store,
  resolveSource: () => ({
    live: {
      publishPost: async ({ chat }) => ({ messageId: String(++writes), chat }),
      deletePost: async () => ({ deleted: true }),
      testConnection: async () => ({
        ok: true,
        verified: true,
        permissionsVerified: false,
      }),
    },
  }),
});
assert.equal((await service.test('news')).verified, true);
assert.equal(writes, 0, 'identity probes do not publish');
const plan = await service.prepare({
  all: true,
  text: '<b>Announcement</b>',
  requestId: 'example-publication',
  debug: true,
});
console.log(
  'Review destinations:',
  plan.preview.targets.map((t) => t.label)
);
const sent = await service.publish(plan.data); // Real callers confirm the preview first.
assert.equal(sent.status, 'sent');
assert.equal(writes, 2);
await service.publish(plan.data);
assert.equal(writes, 2, 'same request ID never republishes');
const deletion = await service.prepareDelete({ id: sent.id });
const deleted = await service.deletePublished(deletion.data);
assert(deleted.results.every((entry) => entry.deletion.status === 'deleted'));
assert(deleted.results.every((entry) => entry.receipt.messageIds.length === 1));
console.log(
  'PASS: saved selection, identity, preview, receipts, replay guard and deletion'
);
