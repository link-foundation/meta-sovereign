// Imported archive media (R-Z15): the /api/media route (strict paths, safe
// types, ranges, streaming), WhatsApp zips whose media lands in media/,
// and the page's reading of stored attachments and reactions. Fakes only.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import { MEDIA_NETWORKS, parseMediaPath } from '../src/server/routes-media.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// A raw request: `fetch` would tidy `..` away before the server saw it.
const get = (base, rawPath, headers = {}, method = 'GET') =>
  new Promise((resolve, reject) => {
    const url = new URL(base);
    const req = http.request(
      { host: url.hostname, port: url.port, path: rawPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });

const withServer = async (run) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-archive-media-'));
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    emailPoll: false,
    enableSync: false,
    enableHandlers: false,
    log: null,
  });
  try {
    await run({ base: `http://127.0.0.1:${handle.port}`, dir });
  } finally {
    await handle.close();
    await rm(dir, { recursive: true, force: true });
  }
};

const keep = async (dir, network, bytes, ext) => {
  const folder = path.join(dir, 'media', network);
  await mkdir(folder, { recursive: true });
  const hash = sha(bytes);
  await writeFile(path.join(folder, `${hash}${ext}`), bytes);
  return hash;
};

describe('GET /api/media/<network>/<sha256>[.<ext>]', () => {
  it('serves a picture inline with its type and nosniff', async () => {
    await withServer(async ({ base, dir }) => {
      const bytes = Buffer.from('not really a png');
      const hash = await keep(dir, 'facebook', bytes, '.png');
      const got = await get(base, `/api/media/facebook/${hash}.png`);
      assert.equal(got.status, 200);
      assert.equal(got.headers['content-type'], 'image/png');
      assert.equal(got.headers['x-content-type-options'], 'nosniff');
      assert.equal(got.headers['content-disposition'], 'inline');
      assert.deepEqual(got.body, bytes);
      const url = `/api/media/facebook/${hash}.png`;
      const head = await get(base, url, {}, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
    });
  });

  it('never shows svg, html or documents inline', async () => {
    await withServer(async ({ base, dir }) => {
      for (const [ext, bytes] of [
        ['.svg', '<svg onload="alert(1)"/>'],
        ['.html', '<script>alert(1)</script>'],
        ['.pdf', '%PDF-1.4'],
      ]) {
        const hash = await keep(dir, 'x', Buffer.from(bytes), ext);
        const got = await get(base, `/api/media/x/${hash}${ext}`);
        assert.equal(got.status, 200, ext);
        assert.match(got.headers['content-disposition'], /^attachment/, ext);
        assert.equal(got.headers['x-content-type-options'], 'nosniff');
        assert.match(got.headers['content-security-policy'], /sandbox/);
        assert.doesNotMatch(got.headers['content-type'], /svg|html/, ext);
      }
    });
  });

  it('answers Range for audio and video, and 416 past the end', async () => {
    await withServer(async ({ base, dir }) => {
      const hash = await keep(
        dir,
        'whatsapp',
        Buffer.from('0123456789'),
        '.mp4'
      );
      const url = `/api/media/whatsapp/${hash}.mp4`;
      const part = await get(base, url, { range: 'bytes=2-5' });
      assert.equal(part.status, 206);
      assert.equal(part.headers['content-range'], 'bytes 2-5/10');
      assert.equal(part.body.toString(), '2345');
      const tail = await get(base, url, { range: 'bytes=-3' });
      assert.equal(tail.body.toString(), '789');
      const open = await get(base, url, { range: 'bytes=8-' });
      assert.equal(open.body.toString(), '89');
      const past = await get(base, url, { range: 'bytes=50-60' });
      assert.equal(past.status, 416);
      assert.equal(past.headers['content-range'], 'bytes */10');
    });
  });

  it('refuses traversal, encodings, bad networks, hashes and extensions', async () => {
    await withServer(async ({ base, dir }) => {
      const hash = await keep(dir, 'facebook', Buffer.from('ok'), '.jpg');
      await writeFile(path.join(dir, 'secret.jpg'), 'secret');
      const bad = [
        `/api/media/../${hash}.jpg`,
        `/api/media/facebook/../../secret.jpg`,
        `/api/media/%2e%2e/${hash}.jpg`,
        `/api/media/facebook/%2e%2e%2f%2e%2e%2fsecret.jpg`,
        `/api/media/facebook/%2E%2E/secret.jpg`,
        `/api/media/facebook/${hash}%2ejpg`,
        `/api/media//etc/passwd`,
        `/api/media/facebook/..%5csecret.jpg`,
        `/api/media/facebook/..\\secret.jpg`,
        `/api/media/%5cfacebook/${hash}.jpg`,
        `/api/media/telegram/${hash}.jpg`,
        `/api/media/email/${hash}.jpg`,
        `/api/media/FACEBOOK/${hash}.jpg`,
        `/api/media/facebook/${hash.toUpperCase()}.jpg`,
        `/api/media/facebook/${hash.slice(1)}.jpg`,
        `/api/media/facebook/${hash}.jpg/extra`,
        `/api/media/facebook/${hash}.exe`,
        `/api/media/facebook/${hash}.`,
        `/api/media/facebook/${hash}.jpg%00.png`,
        `/api/media/facebook`,
        `/api/media/`,
      ];
      for (const p of bad) {
        const got = await get(base, p);
        assert.equal(got.status, 404, `${p} -> ${got.status}`);
        const body = JSON.parse(got.body.toString());
        assert.equal(body.ok, false, p);
        assert.ok(body.error && body.code, p);
      }
      // A well-formed path to a file that was never imported.
      const none = await get(base, `/api/media/facebook/${'0'.repeat(64)}.jpg`);
      assert.equal(none.status, 404);
      assert.equal(JSON.parse(none.body.toString()).code, 'not-found');
      // The good one still works.
      const ok = await get(base, `/api/media/facebook/${hash}.jpg`);
      assert.equal(ok.status, 200);
    });
  });

  it('is refused for another site and for a foreign Host', async () => {
    await withServer(async ({ base, dir }) => {
      const hash = await keep(dir, 'x', Buffer.from('ok'), '.jpg');
      const url = `/api/media/x/${hash}.jpg`;
      const cross = await get(base, url, { 'sec-fetch-site': 'cross-site' });
      assert.equal(cross.status, 403);
      assert.equal(JSON.parse(cross.body.toString()).ok, false);
      const evil = await get(base, url, { host: 'evil.example' });
      assert.ok(evil.status >= 400, `foreign Host -> ${evil.status}`);
    });
  });

  it('parses only validated parts', () => {
    const hash = 'a'.repeat(64);
    assert.deepEqual(parseMediaPath(`/api/media/instagram/${hash}.mp4`), {
      network: 'instagram',
      sha256: hash,
      ext: 'mp4',
    });
    assert.equal(parseMediaPath(`/api/media/instagram/${hash}`).ext, '');
    assert.equal(parseMediaPath(`/api/media/nope/${hash}.mp4`), null);
    assert.ok(MEDIA_NETWORKS.includes('whatsapp'));
  });
});
