/**
 * End-to-end test: drives the local server through HTTP exactly as the
 * web UI does. Exercises the full chain — import -> store -> derived
 * APIs -> verify -> backup.
 *
 * Browser-commander integration is the next iteration: we can swap the
 * `fetch` calls for a `bc.click('[data-view=chat]')` style script as
 * soon as the npm package is published; the assertions stay the same.
 */
import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createBackup, restoreBackup } from '../src/storage/backup.js';
import { createMemoryStore } from '../src/storage/index.js';

describe('e2e: import → derived API → backup → restore', () => {
  it('walks the full pipeline', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-e2e-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      // Import two messages from two networks via PUT.
      for (const m of [
        {
          id: 'msg:telegram:1',
          tokens: ['message', 'telegram', '1'],
          source: 'telegram',
          sender: 'alice',
          chat: 'general',
          body: 'hello world',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          id: 'msg:vk:7',
          tokens: ['message', 'vk', '7'],
          source: 'vk',
          sender: 'alice',
          chat: 'project',
          body: 'see you soon',
          timestamp: '2026-01-02T00:00:00Z',
        },
      ]) {
        const r = await fetch(`${base}/links`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(m),
        });
        await r.json();
      }

      // Status now sees the two messages on two networks.
      const status = await (await fetch(`${base}/api/status`)).json();
      expect(status.messages).toBe(2);

      // Contacts aggregate alice across both.
      const contacts = await (await fetch(`${base}/api/contacts`)).json();
      const alice = contacts.find((c) => c.id === 'alice');
      expect(alice.networks.sort().join(',')).toBe('telegram,vk');
      expect(alice.messageCount).toBe(2);

      // Backup the store, restore into a fresh memory store, confirm round-trip.
      const archive = await createBackup(handle.store, { archiveDir: dir });
      const restored = createMemoryStore();
      const n = await restoreBackup(restored, archive);
      expect(n).toBe(status.links);
      expect((await restored.get('msg:telegram:1')).body).toBe('hello world');
    } finally {
      await handle.close();
    }
  });
});
