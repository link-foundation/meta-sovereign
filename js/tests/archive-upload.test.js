// R-Z23: an export file the user picks is streamed to the server's importer
// (no base64, no 64 MB cap), whatever its network: a Facebook zip is read
// as Facebook (it went to the WhatsApp importer before), a WhatsApp zip
// keeps its media. Same-app check, uniform errors, temp file removed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readdir, rm } from 'node:fs/promises';

import {
  handleArchiveUpload,
  uploadName,
  UPLOAD_TIMEOUT_MS,
} from '../src/server/routes-archive-upload.js';
import { createMemoryStore } from '../src/storage/index.js';
import { zipOf } from './helpers/zip-fixture.js';

const withRoutes = async (extra, run) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'ms-upload-'));
  const store = createMemoryStore();
  const ctx = { storeDir, ...extra };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!(await handleArchiveUpload(store, req, res, url.pathname, ctx))) {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, store, storeDir });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storeDir, { recursive: true, force: true });
  }
};

const upload = (base, source, name, bytes, headers = {}) =>
  fetch(
    `${base}/api/archive/upload?source=${source}&name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', ...headers },
      body: bytes,
    }
  );

const THREAD = 'your_facebook_activity/messages/inbox/anna_Q1';
const facebookZip = () =>
  zipOf([
    [
      `${THREAD}/message_1.json`,
      JSON.stringify({
        participants: [{ name: 'Anna' }, { name: 'Me' }],
        title: 'Anna',
        thread_path: 'inbox/anna_Q1',
        messages: [
          { sender_name: 'Anna', timestamp_ms: 1700000000000, content: 'hi' },
          { sender_name: 'Me', timestamp_ms: 1700000001000, content: 'yo' },
        ],
      }),
      8,
    ],
  ]);

test('a Facebook zip is imported as Facebook, and its temp file removed', async () => {
  await withRoutes({}, async ({ base, store, storeDir }) => {
    const answer = await upload(
      base,
      'facebook',
      'facebook.zip',
      facebookZip()
    );
    assert.equal(answer.status, 200);
    const body = await answer.json();
    assert.equal(body.ok, true);
    assert.equal(body.imported, 2);
    const links = await store.query((l) => l.source === 'facebook');
    assert.equal(links.length, 2);
    assert.deepEqual(await readdir(path.join(storeDir, 'uploads')), []);
  });
});

test('a WhatsApp zip keeps its media in the store', async () => {
  await withRoutes({}, async ({ base, store, storeDir }) => {
    const zip = zipOf([
      [
        '_chat.txt',
        '[25.10.2026, 14:32:11] Anna: Hallo\n[25.10.2026, 14:33:00] Anna: <attached: 00000012-PHOTO-2026-10-25-14-33-00.jpg>',
        8,
      ],
      ['00000012-PHOTO-2026-10-25-14-33-00.jpg', 'jpegbytes'],
    ]);
    const body = await (
      await upload(base, 'whatsapp', 'WhatsApp Chat - Anna.zip', zip)
    ).json();
    assert.equal(body.ok, true);
    assert.equal(body.imported, 2);
    assert.equal(body.media.saved, 1);
    assert.equal((await store.query((l) => l.source === 'whatsapp')).length, 2);
    assert.equal(
      (await readdir(path.join(storeDir, 'media', 'whatsapp'))).length,
      1
    );
  });
});

test('a file with nothing to import is a 400 in the uniform shape', async () => {
  await withRoutes({}, async ({ base, store }) => {
    const answer = await upload(
      base,
      'facebook',
      'other.zip',
      zipOf([['readme.txt', 'nothing here']])
    );
    assert.equal(answer.status, 400);
    const body = await answer.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'bad-archive');
    assert.match(body.error, /no facebook export data/);
    assert.equal((await store.query()).length, 0);
  });
});

test('another site, a JSON post, an unknown network or a full disk are refused', async () => {
  await withRoutes({ diskFree: async () => 1024 }, async ({ base, store }) => {
    const foreign = await upload(base, 'facebook', 'f.zip', facebookZip(), {
      origin: 'https://evil.example',
    });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).code, 'forbidden');
    const json = await upload(base, 'facebook', 'f.zip', facebookZip(), {
      'content-type': 'application/json',
    });
    assert.equal(json.status, 403);
    const unknown = await upload(base, 'nowhere', 'f.zip', facebookZip());
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).code, 'bad-source');
    const full = await upload(base, 'facebook', 'f.zip', facebookZip());
    assert.equal(full.status, 507);
    const body = await full.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'low-disk');
    assert.equal((await store.query()).length, 0);
  });
});

test('an upload name is a plain file name', () => {
  assert.equal(uploadName('../../etc/passwd'), 'passwd');
  assert.equal(uploadName('C:\\Users\\me\\export.zip'), 'export.zip');
  assert.equal(uploadName('a\u0000b\nc.zip'), 'abc.zip');
  assert.equal(uploadName('..'), 'archive');
  assert.equal(uploadName(''), 'archive');
  assert.equal(uploadName(null), 'archive');
});

test('a big upload may take hours to arrive, not the default 5 minutes', () => {
  assert.ok(UPLOAD_TIMEOUT_MS >= 60 * 60_000);
  // Below the 6 h after which a temp folder counts as a crashed upload's.
  assert.ok(UPLOAD_TIMEOUT_MS < 6 * 60 * 60_000);
});
