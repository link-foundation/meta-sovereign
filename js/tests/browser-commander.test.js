/**
 * Browser-commander placeholder e2e (R-F4).
 *
 * The full browser-commander integration awaits the npm package; this
 * test simulates the navigation a real headless browser would perform
 * by exercising every endpoint the SPA's nav buttons trigger when the
 * user clicks them. The contract here is the exact list of `api.*`
 * methods in `js/src/web/dom.js`. When `browser-commander` lands we
 * replace the fetch calls with `bc.click('[data-view=chat]')`-style
 * commands and these assertions stay valid.
 */
import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';

const seedMessages = async (base) => {
  const seed = [
    {
      id: 'msg:telegram:1',
      tokens: ['message', 'telegram', '1'],
      source: 'telegram',
      sender: 'me',
      chat: 'general',
      body: 'where do you live',
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      id: 'msg:telegram:2',
      tokens: ['message', 'telegram', '2'],
      source: 'telegram',
      sender: 'alice',
      chat: 'general',
      body: 'I live in Berlin',
      timestamp: '2024-01-01T00:01:00Z',
    },
  ];
  for (const m of seed) {
    const r = await fetch(`${base}/links`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
    await r.json();
  }
};

describe('browser-commander placeholder: drives every SPA nav target', () => {
  it('serves the SPA shell + every JSON endpoint a nav click triggers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-bc-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      // 1. Browser opens "/", expects HTML shell with nav buttons.
      const shellRes = await fetch(`${base}/`);
      expect(shellRes.status).toBe(200);
      const shell = await shellRes.text();
      for (const view of [
        'chat',
        'operator',
        'contacts',
        'automation',
        'patterns',
        'replies',
        'facts',
        'audience',
        'broadcast',
        'profile',
        'status',
      ]) {
        expect(shell.includes(`data-view="${view}"`)).toBe(true);
      }

      // 2. SPA bootstraps the React bundle + app.css. Consume bodies so
      // Deno's resource-leak detector stays happy.
      const appJs = await fetch(`${base}/app.min.js`);
      expect(appJs.status).toBe(200);
      await appJs.text();
      const appCss = await fetch(`${base}/app.css`);
      expect(appCss.status).toBe(200);
      await appCss.text();

      // Seed so derived views have something to render.
      await seedMessages(base);

      // 3. Each nav click triggers its endpoint. Below mirrors the
      // mapping in js/src/web/views.js.
      const clicks = [
        { view: 'chat', url: '/api/contacts' },
        { view: 'operator', url: '/links' },
        { view: 'contacts', url: '/api/contacts' },
        { view: 'automation', url: '/api/graphs' },
        { view: 'patterns', url: '/api/patterns' },
        { view: 'replies', url: '/api/replies' },
        { view: 'facts', url: '/api/facts' },
        { view: 'audience', url: '/api/audience?q=network%3Atelegram' },
        { view: 'profile', url: '/api/profile' },
        { view: 'status', url: '/api/status' },
      ];
      for (const c of clicks) {
        const r = await fetch(`${base}${c.url}`);
        expect(r.status).toBe(200);
        // Force body consumption to avoid Deno's resource leak warning.
        await r.json();
      }

      // 4. Composer typing fires autocomplete.
      const ac = await fetch(`${base}/api/autocomplete?q=where&me=me`);
      const acBody = await ac.json();
      expect(Array.isArray(acBody)).toBe(true);

      // 5. Broadcast button posts to every selected network.
      const bcRes = await fetch(`${base}/api/broadcast`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi', networks: ['telegram', 'vk'] }),
      });
      const bc = await bcRes.json();
      expect(bc.networks).toEqual(['telegram', 'vk']);
    } finally {
      await handle.close();
    }
  });
});
