import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  markDeleted,
  isTombstone,
  softDeleteLink,
  purgeLink,
  bulkPurge,
  withSoftDelete,
} from '../src/storage/soft-delete.js';
import { startServer } from '../src/server/index.js';

const fetchJson = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

describe('soft-delete (R-K1..R-K6)', () => {
  it('markDeleted is pure and idempotent on the first stamp', () => {
    const link = { id: 'msg:tg:1', tokens: ['m'], body: 'hi' };
    const t1 = markDeleted(link, { at: '2026-05-03T00:00:00.000Z', by: 'tg' });
    expect(isTombstone(link)).toBe(false);
    expect(isTombstone(t1)).toBe(true);
    expect(t1.deleted.at).toBe('2026-05-03T00:00:00.000Z');
    expect(t1.deleted.by).toBe('tg');
    // Second stamp keeps the original `at` so we never lose the
    // *first* time the system saw the delete.
    const t2 = markDeleted(t1, { at: '2026-05-04T00:00:00.000Z', by: 'user' });
    expect(t2.deleted.at).toBe('2026-05-03T00:00:00.000Z');
  });

  it('softDeleteLink writes a tombstone but keeps the row', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'msg:tg:1', tokens: ['m'], body: 'hi' });
    const t = await softDeleteLink(store, 'msg:tg:1', { reason: 'upstream' });
    expect(isTombstone(t)).toBe(true);
    const fromStore = await store.get('msg:tg:1');
    expect(isTombstone(fromStore)).toBe(true);
    expect(fromStore.body).toBe('hi'); // payload preserved (R-K3)
  });

  it('purgeLink refuses without explicit confirm', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'a', tokens: ['a'] });
    let threw = false;
    try {
      await purgeLink(store, 'a');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(await store.get('a')).toBeTruthy();
    const ok = await purgeLink(store, 'a', { confirm: true });
    expect(ok).toBe(true);
    expect(await store.get('a')).toBeFalsy();
  });

  it('bulkPurge only touches tombstones', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'live', tokens: ['x'] });
    await store.put({ id: 'dead', tokens: ['x'] });
    await softDeleteLink(store, 'dead');
    const purged = await bulkPurge(store, () => true, { confirm: true });
    expect(purged).toEqual(['dead']);
    expect(await store.get('live')).toBeTruthy();
    expect(await store.get('dead')).toBeFalsy();
  });

  it('withSoftDelete decorator exposes softDelete/purge/bulkPurge', async () => {
    const inner = createMemoryStore();
    const store = withSoftDelete(inner);
    await store.put({ id: 'a', tokens: ['a'] });
    const t = await store.softDelete('a', { reason: 'test' });
    expect(isTombstone(t)).toBe(true);
    expect(isTombstone(await store.get('a'))).toBe(true);
    const ok = await store.purge('a', { confirm: true });
    expect(ok).toBe(true);
  });

  it('HTTP DELETE soft-deletes by default and ?purge=1&confirm=1 hard-deletes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-soft-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetchJson(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'msg:x:1', tokens: ['m'] }),
      });
      const del = await fetchJson(`${base}/links/msg:x:1?reason=upstream`, {
        method: 'DELETE',
      });
      expect(del.status).toBe(200);
      expect(del.body.soft).toBe(true);
      expect(del.body.deleted?.reason).toBe('upstream');

      // Default GET hides tombstones (R-K2).
      const gone = await fetchJson(`${base}/links/msg:x:1`);
      expect(gone.status).toBe(404);

      // `include=tombstones` exposes them for restore UIs.
      const seen = await fetchJson(`${base}/links/msg:x:1?include=tombstones`);
      expect(seen.status).toBe(200);
      expect(seen.body.deleted?.reason).toBe('upstream');

      // ?purge=1 alone is rejected.
      const noConfirm = await fetchJson(`${base}/links/msg:x:1?purge=1`, {
        method: 'DELETE',
      });
      expect(noConfirm.status).toBe(400);

      // ?purge=1&confirm=1 hard-deletes (R-K4).
      const hard = await fetchJson(`${base}/links/msg:x:1?purge=1&confirm=1`, {
        method: 'DELETE',
      });
      expect(hard.status).toBe(200);
      expect(hard.body.purged).toBe(true);
      const reallyGone = await fetchJson(
        `${base}/links/msg:x:1?include=tombstones`
      );
      expect(reallyGone.status).toBe(404);
    } finally {
      await handle.close();
    }
  });

  it('POST /api/links/purge-tombstones requires { confirm: true }', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-bulk-'));
    const handle = await startServer({ port: 0, storeDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetchJson(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'msg:x:1', tokens: ['m'] }),
      });
      await fetchJson(`${base}/links/msg:x:1`, { method: 'DELETE' });
      const noConfirm = await fetchJson(`${base}/api/links/purge-tombstones`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(noConfirm.status).toBe(400);

      const ok = await fetchJson(`${base}/api/links/purge-tombstones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      expect(ok.status).toBe(200);
      expect(ok.body.purged).toEqual(['msg:x:1']);
    } finally {
      await handle.close();
    }
  });
});
