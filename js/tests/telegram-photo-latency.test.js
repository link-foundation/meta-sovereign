import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createMediaReader } from '../src/sources/telegram-media.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const media = (reference = 1) => ({
  className: 'MessageMediaPhoto',
  photo: {
    id: '7',
    accessHash: '8',
    dcId: 2,
    fileReference: { bytes: Buffer.from([reference]).toString('base64') },
    sizes: [
      { className: 'PhotoSize', type: 'm', size: 15_255 },
      { className: 'PhotoSize', type: 'x', size: 52_718 },
    ],
  },
});
const importer = async () => ({
  Api: {
    InputPhotoFileLocation: class {
      constructor(fields) {
        Object.assign(this, fields);
      }
    },
  },
  helpers: { returnBigInt: BigInt },
});
const fixture = async (t, options) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-photo-latency-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createMemoryStore();
  await store.put({ id: 'msg:telegram:42:4', raw: { media: media() } });
  return {
    store,
    reader: createMediaReader({ store, dir, importer, ...options }),
  };
};

test('concurrent photo requests share download and cache work at foreground priority', async (t) => {
  const started = deferred();
  const finish = deferred();
  const priorities = [];
  const logs = [];
  let downloads = 0;
  const { reader } = await fixture(t, {
    queue: {
      run: (_key, priority, task) => {
        priorities.push(priority);
        return task();
      },
    },
    client: async () => ({
      downloadFile: async () => {
        downloads++;
        started.resolve();
        await finish.promise;
        return Buffer.from('photo');
      },
    }),
    log: (entry) => logs.push(entry),
  });
  const requests = Array.from({ length: 3 }, () =>
    reader.read({ chat: '42', id: 4 })
  );
  await started.promise;
  assert.equal(downloads, 1);
  finish.resolve();
  const pictures = await Promise.all(requests);
  assert.ok(pictures.every((p) => p.buffer.toString() === 'photo'));
  await reader.read({ chat: '42', id: 4 });
  assert.equal(downloads, 1, 'subsequent reads use the completed disk cache');
  assert.deepEqual(priorities, ['view']);
  assert.ok(
    logs.some((entry) => entry.event === 'telegram_media' && entry.cached)
  );
  const transfer = logs.find((entry) => entry.cached === false);
  for (const key of ['queue_ms', 'download_ms', 'refresh_ms', 'duration_ms']) {
    assert.ok(Number.isFinite(transfer[key]) && transfer[key] >= 0, key);
  }
});

test('different photo sizes share one expired-reference refresh and retry with fresh references', async (t) => {
  const bothFailed = deferred();
  const refreshStarted = deferred();
  const release = deferred();
  let stale = 0;
  const refreshed = [];
  const priorities = [];
  const setup = await fixture(t, {
    queue: {
      run: (_key, priority, task) => {
        priorities.push(priority);
        return task();
      },
    },
    refresh: async (request) => {
      refreshed.push(request);
      refreshStarted.resolve();
      await release.promise;
      await store.put({ id: 'msg:telegram:42:4', raw: { media: media(2) } });
    },
    client: async () => ({
      downloadFile: async (location) => {
        if (location.fileReference[0] === 1) {
          if (++stale === 2) {
            bothFailed.resolve();
          }
          throw Object.assign(new Error('FILE_REFERENCE_EXPIRED'), {
            errorMessage: 'FILE_REFERENCE_EXPIRED',
          });
        }
        return Buffer.from('fresh');
      },
    }),
  });
  const store = setup.store;
  const small = setup.reader.read({ chat: '42', id: 4, size: 'm' });
  const large = setup.reader.read({ chat: '42', id: 4, size: 'x' });
  await Promise.all([bothFailed.promise, refreshStarted.promise]);
  assert.equal(refreshed.length, 1);
  release.resolve();
  assert.ok(
    (await Promise.all([small, large])).every(
      (p) => p.buffer.toString() === 'fresh'
    )
  );
  assert.deepEqual(refreshed, [{ chat: '42', ids: [4], priority: 'view' }]);
  assert.ok(priorities.every((priority) => priority === 'view'));
});

test('failed photo requests release their shared work so automatic recovery can retry', async (t) => {
  let tries = 0;
  const { reader } = await fixture(t, {
    queue: { run: (_key, _priority, task) => task() },
    client: async () => ({
      downloadFile: async () => {
        if (++tries === 1) {
          throw new Error('network interrupted');
        }
        return Buffer.from('recovered');
      },
    }),
  });
  await assert.rejects(
    reader.read({ chat: '42', id: 4 }),
    /network interrupted/
  );
  assert.equal(
    (await reader.read({ chat: '42', id: 4 })).buffer.toString(),
    'recovered'
  );
  assert.equal(tries, 2);
});
