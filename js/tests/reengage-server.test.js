// Issue #31 / R-W9: the re-engage API plans dormant contacts, sends one
// confirmed draft at a time, records manual sends and skips, and sends
// a whole plan only in batch mode with an explicit confirmation.

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/index.js';
import { buildMessageLink } from '../src/sources/link.js';
import { startServer } from '../src/server/index.js';
import { DAY_MS } from '../src/crm/reengage.js';

const NOW = '2026-10-01T00:00:00Z';
const ago = (n) => new Date(Date.parse(NOW) - n * DAY_MS).toISOString();

const seed = async () => {
  const store = createMemoryStore();
  let id = 0;
  for (const [chat, sender, body, days] of [
    ['101', 'me', 'Привет, как ты?', 130],
    ['101', 'alice', 'Норм, а ты?', 120],
    ['102', 'me', 'Здравствуйте, вы сможете помочь?', 200],
    ['102', 'bob', 'Да', 200],
  ]) {
    await store.put(
      buildMessageLink({
        source: 'vk',
        externalId: String((id += 1)),
        sender,
        chat,
        body,
        timestamp: ago(days),
      })
    );
  }
  return store;
};

const post = async (base, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

const withServer = async (send, fn) => {
  const store = await seed();
  const handle = await startServer({
    port: 0,
    store,
    enableHandlers: false,
    enableSync: false,
    reengage: { send },
  });
  try {
    return await fn(`http://127.0.0.1:${handle.port}`, store);
  } finally {
    await handle.close();
  }
};

const records = async (store) =>
  store.query((l) => l.id.startsWith('reengage:'));

describe('reengage api', () => {
  it('plans dormant contacts with the detected form', async () => {
    await withServer(null, async (base) => {
      const { status, body } = await post(base, '/api/reengage/plan', {
        now: NOW,
      });
      expect(status).toBe(200);
      expect(body.mode).toBe('safe');
      const forms = Object.fromEntries(
        body.drafts.map((d) => [d.contact, d.form])
      );
      expect(forms).toEqual({ alice: 'informal', bob: 'formal' });
    });
  });
  it('sends one draft only with confirm: true', async () => {
    const sent = [];
    const send = async (draft) => {
      sent.push(draft.text);
      return { ok: true };
    };
    await withServer(send, async (base, store) => {
      const plan = (await post(base, '/api/reengage/plan', { now: NOW })).body;
      const draft = { ...plan.drafts[0], text: 'Edited text' };
      const refused = await post(base, '/api/reengage/send', { draft });
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('confirm-required');
      expect(sent.length).toBe(0);
      const ok = await post(base, '/api/reengage/send', {
        draft,
        confirm: true,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('sent');
      expect(sent).toEqual(['Edited text']);
      expect((await records(store))[0].text).toBe('Edited text');
      const next = await post(base, '/api/reengage/plan', { now: NOW });
      expect(next.body.drafts.length).toBe(1);
    });
  });
  it('reports a failed send as 502 and records it as failed', async () => {
    const send = async () => {
      throw new Error('blocked by privacy settings');
    };
    await withServer(send, async (base, store) => {
      const plan = (await post(base, '/api/reengage/plan', { now: NOW })).body;
      const res = await post(base, '/api/reengage/send', {
        draft: plan.drafts[0],
        confirm: true,
      });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('blocked by privacy settings');
      expect((await records(store))[0].status).toBe('failed');
    });
  });
  it('records a manual send and a skip', async () => {
    await withServer(null, async (base, store) => {
      const plan = (await post(base, '/api/reengage/plan', { now: NOW })).body;
      const [a, b] = plan.drafts;
      expect(
        (await post(base, '/api/reengage/mark', { draft: a, status: 'sent' }))
          .status
      ).toBe(200);
      await post(base, '/api/reengage/mark', { draft: b, status: 'skipped' });
      const bad = await post(base, '/api/reengage/mark', {
        draft: b,
        status: 'maybe',
      });
      expect(bad.status).toBe(400);
      const statuses = (await records(store)).map((r) => r.status).sort();
      expect(statuses).toEqual(['sent', 'skipped']);
    });
  });
  it('sends everything only in batch mode with confirm', async () => {
    const sent = [];
    const send = async (draft) => sent.push(draft.chat);
    await withServer(send, async (base) => {
      const safe = await post(base, '/api/reengage/run', {
        now: NOW,
        confirm: true,
      });
      expect(safe.status).toBe(400);
      expect(safe.body.code).toBe('safe-mode');
      const run = await post(base, '/api/reengage/run', {
        now: NOW,
        mode: 'batch',
        confirm: true,
      });
      expect(run.status).toBe(200);
      expect(run.body.progress.sent).toBe(2);
      expect(sent.sort()).toEqual(['101', '102']);
    });
  });
  it('rejects non-POST requests', async () => {
    await withServer(null, async (base) => {
      const r = await fetch(`${base}/api/reengage/plan`);
      expect(r.status).toBe(405);
    });
  });
});
