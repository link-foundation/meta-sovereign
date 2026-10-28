import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
  isMessageVersion,
} from '../src/storage/message-versions.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { isTombstone } from '../src/storage/soft-delete.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';

const msg = (body, extra = {}) => ({
  id: 'msg:telegram:42:1',
  source: 'telegram',
  chat: '42',
  sender: '42',
  body,
  timestamp: '2026-10-28T10:00:00Z',
  raw: { id: 1 },
  ...extra,
});
const bodies = async (store) =>
  (await messageVersions(store, msg('').id)).versions.map(
    (item) => item.snapshot.body
  );

test('edits retain both complete versions, deduplicate echoes and ignore counters and deletions', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.put(msg('first'));
  await store.put(
    msg('second', {
      raw: {
        id: 1,
        editDate: 42,
        entities: [{ className: 'MessageEntityBold', offset: 0, length: 6 }],
      },
    })
  );
  const current = await store.get(msg('').id);
  await store.put({
    ...current,
    views: 45,
    raw: { ...current.raw, views: 500, reactions: { count: 1 } },
  });
  await store.put({ ...current, deleted: true });
  const versions = (await messageVersions(store, msg('').id)).versions;
  assert.deepEqual(
    versions.map((item) => item.snapshot.body),
    ['second', 'first']
  );
  assert.equal(versions[0].snapshot.raw.entities[0].length, 6);
  assert.equal((await store.get(msg('').id)).versionCount, 2);
  assert.equal((await store.query(isMessageVersion)).length, 2);
  await assert.rejects(
    store.put({ ...versions[0], snapshot: msg('tampered') }),
    { code: 'VERSION_IMMUTABLE' }
  );
});

test('concurrent edits and repeated changes in one batch retain every observed state, including reverts', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.put(msg('first'));
  await Promise.all([store.put(msg('second')), store.put(msg('third'))]);
  await store.putMany([msg('first'), msg('fourth'), msg('fourth')]);
  assert.deepEqual(await bodies(store), [
    'fourth',
    'first',
    'third',
    'second',
    'first',
  ]);
  assert.equal((await store.get(msg('').id)).versionCount, 5);
});

test('formatting and replacement attachments count as edits, refreshed access tokens do not', async () => {
  const store = withMessageVersions(createMemoryStore());
  const original = msg('caption', {
    raw: {
      media: { photo: { id: 'a', accessHash: 'old', fileReference: 'old' } },
    },
  });
  await store.put(original);
  await store.put({
    ...original,
    raw: {
      media: {
        photo: { id: 'a', accessHash: 'fresh', fileReference: 'fresh' },
      },
    },
  });
  assert.equal((await store.query(isMessageVersion)).length, 0);
  await store.put({
    ...original,
    raw: {
      ...original.raw,
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 7 }],
    },
  });
  await store.put({ ...original, raw: { media: { photo: { id: 'b' } } } });
  const history = (await messageVersions(store, original.id)).versions;
  assert.equal(history.length, 3);
  assert.equal(history[0].snapshot.raw.media.photo.id, 'b');
  assert.equal(history[1].snapshot.raw.entities[0].length, 7);
});

test('a failed history write leaves the current message intact and does not acknowledge its replacement', async () => {
  const inner = createMemoryStore();
  await inner.put(msg('first'));
  let fail = true;
  const store = withMessageVersions({
    ...inner,
    putMany: async (links) => {
      if (fail && links.some(isMessageVersion)) {
        throw new Error('fixture disk full');
      }
      return inner.putMany(links);
    },
  });
  await assert.rejects(store.put(msg('second')), /disk full/);
  assert.equal((await store.get(msg('').id)).body, 'first');
  fail = false;
  await store.put(msg('second'));
  assert.deepEqual(await bodies(store), ['second', 'first']);
});

test('partial writes can be replayed without losing the first capture or duplicating versions', async () => {
  const inner = createMemoryStore();
  await inner.put(msg('first'));
  let fail = true;
  const store = withMessageVersions({
    ...inner,
    putMany: async (links) => {
      if (fail && links.some((link) => link.id.startsWith('msg:'))) {
        throw new Error('fixture current write failed');
      }
      return inner.putMany(links);
    },
  });
  await assert.rejects(store.put(msg('second')), /current write failed/);
  const saved = await inner.query(isMessageVersion);
  fail = false;
  await store.put(msg('second'));
  assert.deepEqual(await inner.query(isMessageVersion), saved);
  assert.deepEqual(await bodies(store), ['second', 'first']);
});

test('headless durable capture survives compaction, restart, provider deletion and cache removal', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-versions-'));
  let store;
  try {
    store = await openDualStore(dir);
    const cache = path.join(dir, 'media', 'telegram', '42');
    await mkdir(cache, { recursive: true });
    await store.put(
      msg('before', { raw: { id: 1, media: { photo: { id: 'photo-a' } } } })
    );
    await writeFile(path.join(cache, '1-m'), 'captured picture');
    await writeFile(path.join(cache, '1-m.type'), 'image/jpeg');
    await store.put(
      msg('after', { raw: { id: 1, media: { photo: { id: 'photo-b' } } } })
    );
    await assert.rejects(stat(path.join(cache, '1-m')), { code: 'ENOENT' });
    const versions = (await messageVersions(store, msg('').id)).versions;
    const asset = versions[1].assets[0];
    assert.equal(
      await readFile(path.join(dir, 'media', asset.path), 'utf8'),
      'captured picture'
    );
    await store.put({ ...(await store.get(msg('').id)), deleted: true });
    await store.flush();
    await store.close();
    const log = await createLinoTextStore(path.join(dir, 'data.lino'));
    await log.compact();
    await log.flush();
    store = await openDualStore(dir);
    assert.deepEqual(await bodies(store), ['after', 'before']);
    assert.equal(isTombstone(await store.get(msg('').id)), true);
    await rm(path.join(dir, 'media', 'telegram'), {
      recursive: true,
      force: true,
    });
    assert.equal(
      await readFile(path.join(dir, 'media', asset.path), 'utf8'),
      'captured picture'
    );
    const other = { ...msg('other'), id: 'msg:telegram:42:2', raw: { id: 2 } };
    await store.put(other);
    const secondCache = path.join(dir, 'media', 'telegram', '42');
    await mkdir(secondCache, { recursive: true });
    await writeFile(path.join(secondCache, '2-m'), 'captured picture');
    await writeFile(path.join(secondCache, '2-m.type'), 'image/jpeg');
    // Even an unedited message pins cached bytes when it is first deleted.
    await store.put({ ...other, deleted: true });
    await store.delete(msg('').id);
    assert.equal((await store.query(isMessageVersion)).length, 1);
    assert.equal(
      await readFile(path.join(dir, 'media', asset.path), 'utf8'),
      'captured picture',
      'a shared attachment is retained for the other message'
    );
    await store.delete(other.id);
    assert.equal((await store.query(isMessageVersion)).length, 0);
    await assert.rejects(stat(path.join(dir, 'media', asset.path)), {
      code: 'ENOENT',
    });
  } finally {
    await store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
