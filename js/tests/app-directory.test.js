import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  defaultStoreDir,
  resolveUserStore,
} from '../src/storage/app-directory.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { loadLocalTls } from '../src/server/local-tls.js';

test('the default store belongs to the OS user and an explicit override wins', () => {
  assert.equal(
    defaultStoreDir({ platform: 'darwin', home: '/user', env: {} }),
    path.join(
      '/user',
      'Library',
      'Application Support',
      'Meta Sovereign',
      'store'
    )
  );
  assert.equal(
    defaultStoreDir({
      platform: 'linux',
      home: '/user',
      env: { XDG_CONFIG_HOME: '/config' },
    }),
    path.join('/config', 'Meta Sovereign', 'store')
  );
  assert.equal(
    defaultStoreDir({
      platform: 'win32',
      home: '/user',
      env: { APPDATA: '/roaming' },
    }),
    path.join('/roaming', 'Meta Sovereign', 'store')
  );
  assert.equal(
    defaultStoreDir({ env: { META_SOVEREIGN_STORE_DIR: '/chosen' } }),
    path.resolve('/chosen')
  );
});

test('a legacy store migrates once with messages, credentials, media and certificate intact and reopens without another import', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-user-data-'));
  const cwd = path.join(root, 'project');
  const legacy = path.join(cwd, '.meta-sovereign');
  const target = path.join(root, 'user-app', 'store');
  try {
    const store = await openDualStore(legacy);
    await store.put({
      id: 'msg:telegram:42:1',
      source: 'telegram',
      chat: '42',
      body: 'saved message',
      tokens: [],
    });
    await store.put({
      id: 'secret:telegram:user-session',
      value: 'fake-persisted-session',
      tokens: [],
    });
    await store.close();
    const original = await loadLocalTls(legacy);
    await fs.mkdir(path.join(legacy, 'media'), { recursive: true });
    await fs.writeFile(path.join(legacy, 'media', 'saved.bin'), 'saved bytes');
    assert.equal(await resolveUserStore({ cwd, destination: target }), target);
    assert.equal(await fs.realpath(legacy), await fs.realpath(target));
    assert.equal(
      (await loadLocalTls(target)).fingerprint,
      original.fingerprint
    );
    for (let n = 0; n < 2; n += 1) {
      const reopened = await openDualStore(target);
      assert.equal(
        (await reopened.get('msg:telegram:42:1')).body,
        'saved message'
      );
      assert.equal(
        (await reopened.get('secret:telegram:user-session')).value,
        'fake-persisted-session'
      );
      await reopened.close();
    }
    assert.equal(
      await fs.readFile(path.join(legacy, 'media', 'saved.bin'), 'utf8'),
      'saved bytes'
    );
    assert.equal(await resolveUserStore({ cwd, destination: target }), target);
    assert.equal(
      await resolveUserStore({
        cwd: path.join(root, 'other-directory'),
        destination: target,
      }),
      target
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('migration refuses to overwrite an existing user store', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-user-conflict-'));
  try {
    const legacy = path.join(root, '.meta-sovereign');
    const target = path.join(root, 'target');
    for (const dir of [legacy, target]) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'data.lino'), dir);
    }
    await assert.rejects(resolveUserStore({ cwd: root, destination: target }), {
      code: 'STORE_MIGRATION_CONFLICT',
    });
    assert.equal(
      await fs.readFile(path.join(legacy, 'data.lino'), 'utf8'),
      legacy
    );
    assert.equal(
      await fs.readFile(path.join(target, 'data.lino'), 'utf8'),
      target
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
