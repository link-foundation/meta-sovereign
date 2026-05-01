import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

const seedMessages = async (base) => {
  const seed = [
    {
      id: 'msg:telegram:1',
      tokens: ['message', 'telegram', '1'],
      sender: 'me',
      chat: 'general',
      source: 'telegram',
      body: 'where do you live',
      timestamp: '2024-01-01T00:00:00Z',
    },
    {
      id: 'msg:telegram:2',
      tokens: ['message', 'telegram', '2'],
      sender: 'alice',
      chat: 'general',
      source: 'telegram',
      body: 'I live in Berlin',
      timestamp: '2024-01-01T00:01:00Z',
    },
    {
      id: 'msg:vk:3',
      tokens: ['message', 'vk', '3'],
      sender: 'bob',
      chat: 'wall',
      source: 'vk',
      body: 'привет',
      timestamp: '2024-01-02T00:00:00Z',
    },
    {
      id: 'msg:telegram:4',
      tokens: ['message', 'telegram', '4'],
      sender: 'me',
      chat: 'general',
      source: 'telegram',
      body: 'thank you so much',
      timestamp: '2024-01-03T00:00:00Z',
    },
  ];
  for (const m of seed) {
    await fetchJson(`${base}/links`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
  }
};

describe('server iteration 3 routes', () => {
  it('drives the full pipeline: patterns, replies, graphs, facts, audience', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-i3-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await seedMessages(base);

      // Pattern persistence (R-C1).
      await fetchJson(`${base}/api/patterns`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'pattern:where',
          tokens: ['pattern', 'where'],
          regex: 'where do you live',
          flags: 'i',
        }),
      });
      const ps = await fetchJson(`${base}/api/patterns`);
      expect(ps.body.length).toBe(1);

      // Reply variations (R-C2).
      await fetchJson(`${base}/api/replies`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'reply:thanks',
          tokens: ['reply-group', 'thanks'],
          variations: ['you are welcome', 'no problem'],
        }),
      });
      const rs = await fetchJson(`${base}/api/replies`);
      expect(rs.body.length).toBe(1);

      // Graph save + run (R-C3, R-C4).
      await fetchJson(`${base}/api/graphs`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'graph:greet',
          tokens: ['graph', 'greet'],
          nodes: [
            { id: 'p1', kind: 'pattern', regex: 'привет', flags: 'i' },
            {
              id: 'r1',
              kind: 'reply',
              group: { id: 'reply:hi', variations: ['hi!'] },
            },
          ],
          edges: [{ from: 'p1', to: 'r1' }],
        }),
      });
      const plan = await fetchJson(`${base}/api/graphs/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'graph:greet',
          message: { body: 'привет' },
          mode: 'auto',
        }),
      });
      expect(plan.status).toBe(200);
      expect(plan.body.length).toBeGreaterThan(0);

      // Facts (R-C5).
      const facts = await fetchJson(`${base}/api/facts`);
      expect(facts.body.facts.length).toBeGreaterThan(0);
      expect(facts.body.byAnswerer.alice).toBeTruthy();

      // Autocomplete (R-B2).
      const ac = await fetchJson(`${base}/api/autocomplete?q=th&me=me`);
      expect(ac.body.includes('thank you so much')).toBe(true);

      // Audience set algebra (R-D2).
      const aud = await fetchJson(
        `${base}/api/audience?q=${encodeURIComponent('network:telegram AND chat:general')}`
      );
      expect(aud.body.length).toBeGreaterThan(0);
      const ids = aud.body.map((c) => c.id);
      expect(ids.includes('alice') || ids.includes('me')).toBe(true);

      // Search (R-D4).
      const sr = await fetchJson(`${base}/api/search?q=Berlin&min=0.1`);
      expect(sr.body.length).toBeGreaterThan(0);

      // Profile + resume sync planning (R-D5, R-D6).
      const prof = await fetchJson(`${base}/api/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'me', bio: 'hi' }),
      });
      expect(prof.body.plannedSyncs.length).toBeGreaterThan(0);
      const res = await fetchJson(`${base}/api/resume`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'engineer', body: '...' }),
      });
      expect(res.body.plannedSyncs.length).toBeGreaterThan(0);

      // Broadcast (R-B4).
      const bc = await fetchJson(`${base}/api/broadcast`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'hello world',
          networks: ['telegram', 'vk'],
        }),
      });
      expect(bc.body.networks).toEqual(['telegram', 'vk']);

      // Status now reflects the new entities.
      const st = await fetchJson(`${base}/api/status`);
      expect(st.body.patterns).toBe(1);
      expect(st.body.graphs).toBe(1);
      expect(st.body.replies).toBe(1);
      expect(st.body.contacts).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });
});
