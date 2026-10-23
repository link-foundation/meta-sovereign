// The email server routes and the periodic pull (R-Z5): attachments served
// only from the media folder and only to the app, a pull that cannot be
// hammered, failures that say so, and a poller that backs off. Fakes only.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import { createEmailPoller } from '../src/server/email-poller.js';
import { createAttachmentStore } from '../src/server/email-attachments.js';
import { createMemoryStore } from '../src/storage/index.js';

const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex');

const withServer = async (options, run) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-email-routes-'));
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    emailPoll: false,
    ...options,
  });
  try {
    await run({
      base: `http://127.0.0.1:${handle.port}`,
      store: handle.store,
      dir,
    });
  } finally {
    await handle.close();
  }
};

const keep = async (dir, bytes) => {
  const mediaDir = path.join(dir, 'media', 'email');
  await mkdir(mediaDir, { recursive: true });
  const hash = hashOf(bytes);
  await writeFile(path.join(mediaDir, hash), bytes);
  return hash;
};

describe('GET /api/email/attachment', () => {
  it('serves a kept attachment as a download, never as a page', async () => {
    await withServer({}, async ({ base, store, dir }) => {
      const bytes = Buffer.from('<html><script>alert(1)</script></html>');
      const file = await keep(dir, bytes);
      await store.put({
        id: 'msg:email:a1',
        source: 'email',
        chat: 'c',
        attachments: [
          {
            kind: 'file',
            name: '../../etc/pass"wd.html',
            mime: 'text/html',
            size: bytes.length,
            file,
          },
        ],
      });
      const res = await fetch(
        `${base}/api/email/attachment?id=msg%3Aemail%3Aa1&n=0`
      );
      assert.equal(res.status, 200);
      assert.equal(
        Buffer.from(await res.arrayBuffer()).toString(),
        bytes.toString()
      );
      const disposition = res.headers.get('content-disposition');
      assert.match(disposition, /^attachment; filename\*=UTF-8''/);
      assert.doesNotMatch(disposition, /\.\.\/|"/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.match(res.headers.get('content-security-policy'), /sandbox/);
    });
  });

  it('shows only safe pictures inline, by cid', async () => {
    await withServer({}, async ({ base, store, dir }) => {
      const png = await keep(dir, Buffer.from('PNG'));
      const svg = await keep(dir, Buffer.from('<svg onload="x()"/>'));
      await store.put({
        id: 'msg:email:a2',
        source: 'email',
        chat: 'c',
        attachments: [
          {
            kind: 'file',
            name: 'p.png',
            mime: 'image/png',
            cid: 'pic@x',
            inline: true,
            file: png,
          },
          {
            kind: 'file',
            name: 's.svg',
            mime: 'image/svg+xml',
            cid: 'svg@x',
            inline: true,
            file: svg,
          },
        ],
      });
      const shown = await fetch(
        `${base}/api/email/attachment?id=msg%3Aemail%3Aa2&cid=pic@x&inline=1`
      );
      assert.match(shown.headers.get('content-disposition'), /^inline;/);
      assert.equal(shown.headers.get('content-type'), 'image/png');
      const vector = await fetch(
        `${base}/api/email/attachment?id=msg%3Aemail%3Aa2&n=1&inline=1`
      );
      assert.match(vector.headers.get('content-disposition'), /^attachment;/);
    });
  });

  it('never reads outside the media folder', async () => {
    await withServer({}, async ({ base, store }) => {
      for (const file of [
        '../../../etc/passwd',
        '..%2f..%2fx',
        '/etc/passwd',
        'abc',
      ]) {
        await store.put({
          id: 'msg:email:evil',
          source: 'email',
          chat: 'c',
          attachments: [{ kind: 'file', name: 'x', mime: 'text/plain', file }],
        });
        const res = await fetch(
          `${base}/api/email/attachment?id=msg%3Aemail%3Aevil&n=0`
        );
        assert.equal(res.status, 404);
        assert.equal((await res.json()).code, 'not-kept');
      }
      const other = await fetch(
        `${base}/api/email/attachment?id=msg%3Atelegram%3A1&n=0`
      );
      assert.equal(other.status, 404);
      const missing = await fetch(
        `${base}/api/email/attachment?id=msg%3Aemail%3Aevil&n=7`
      );
      assert.equal(missing.status, 404);
    });
  });

  it('refuses another website', async () => {
    await withServer({}, async ({ base, store, dir }) => {
      const file = await keep(dir, Buffer.from('secret'));
      await store.put({
        id: 'msg:email:a3',
        source: 'email',
        chat: 'c',
        attachments: [
          { kind: 'file', name: 'f.txt', mime: 'text/plain', file },
        ],
      });
      const res = await fetch(
        `${base}/api/email/attachment?id=msg%3Aemail%3Aa3&n=0`,
        {
          headers: { 'sec-fetch-site': 'cross-site' },
        }
      );
      assert.equal(res.status, 403);
    });
  });
});

describe('the attachment store', () => {
  it('keeps a file once under its hash and refuses names that are not hashes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-email-files-'));
    const files = createAttachmentStore(dir);
    const hash = files.save(Buffer.from('data'));
    assert.equal(hash, hashOf(Buffer.from('data')));
    assert.equal(files.save(Buffer.from('data')), hash);
    assert.equal(files.read(hash).toString(), 'data');
    assert.equal(files.read(`../${hash}`), null);
    assert.equal(files.pathOf('x'.repeat(64)), null);
    assert.equal(files.save(Buffer.alloc(0)), null);
  });
});

describe('POST /api/email/pull', () => {
  const post = (base, body = {}) =>
    fetch(`${base}/api/email/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('uses the saved connection, and answers once every 15 seconds', async () => {
    const seen = [];
    await withServer(
      {
        emailLiveFactory: (config) => {
          seen.push(config);
          return {
            pullMessages: async () => ({
              links: [],
              rawCount: 0,
              nextOffset: null,
            }),
          };
        },
      },
      async ({ base, store }) => {
        await store.put({ id: 'secret:email:host', token: 'imap.example.com' });
        await store.put({
          id: 'secret:email:username',
          token: 'me@example.com',
        });
        await store.put({ id: 'secret:email:password', token: 'pw' });
        const first = await post(base);
        assert.equal(first.status, 200);
        assert.equal((await first.json()).ok, true);
        assert.equal(seen[0].host, 'imap.example.com');
        assert.equal(seen[0].password, 'pw');
        assert.equal(seen[0].protocol, 'imap');
        const second = await post(base);
        assert.equal(second.status, 429);
        const body = await second.json();
        assert.equal(body.code, 'rate-limited');
        assert.equal(body.ok, false);
        assert.ok(body.retryAfter > 0);
        assert.equal(seen.length, 1);
      }
    );
  });

  it('fails loudly, not with a success', async () => {
    await withServer(
      {
        emailLiveFactory: () => ({
          pullMessages: async () => {
            throw Object.assign(
              new Error('IMAP command failed: A001 NO login'),
              {
                code: 'imap-failed',
              }
            );
          },
        }),
      },
      async ({ base }) => {
        const res = await post(base);
        assert.equal(res.status, 502);
        const body = await res.json();
        assert.equal(body.ok, false);
        assert.equal(body.code, 'imap-failed');
        assert.match(body.error, /login/);
      }
    );
  });

  it('says what is missing when nothing is configured', async () => {
    await withServer({}, async ({ base }) => {
      const res = await post(base, { protocol: 'gmail' });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, 'no-token');
    });
  });
});

describe('the periodic pull', () => {
  const timers = () => {
    const pending = [];
    return {
      pending,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref() {} };
        pending.push(timer);
        return timer;
      },
      clearTimer: (timer) => {
        pending.splice(pending.indexOf(timer), 1);
      },
    };
  };

  it('does nothing until a mailbox is connected', async () => {
    const store = createMemoryStore();
    const clock = timers();
    let pulls = 0;
    const poller = createEmailPoller({
      store,
      ...clock,
      pull: async () => {
        pulls += 1;
        return { imported: 0 };
      },
    });
    await poller.runNow();
    assert.equal(pulls, 0);
    poller.stop();
  });

  it('pulls when configured, and backs off after a failure', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'secret:email:access-token', token: 'tok' });
    const clock = timers();
    const events = [];
    let fail = true;
    const poller = createEmailPoller({
      store,
      intervalMs: 10 * 60_000,
      ...clock,
      log: (event) => events.push(event.event),
      pull: async () => {
        if (fail) {
          throw Object.assign(new Error('429'), { code: 'rate-limited' });
        }
        return { imported: 3 };
      },
    });
    await poller.runNow();
    assert.deepEqual(events, ['email_poll_failed']);
    assert.equal(clock.pending.at(-1).ms, 20 * 60_000);
    await poller.runNow();
    assert.equal(clock.pending.at(-1).ms, 40 * 60_000);
    fail = false;
    await poller.runNow();
    assert.equal(clock.pending.at(-1).ms, 10 * 60_000);
    assert.equal(events.at(-1), 'email_polled');
    poller.stop();
  });

  it('stop() ends the timer', async () => {
    const store = createMemoryStore();
    const clock = timers();
    const poller = createEmailPoller({
      store,
      ...clock,
      pull: async () => ({}),
    });
    poller.start();
    assert.equal(clock.pending.length, 1);
    poller.stop();
    assert.equal(clock.pending.length, 0);
  });
});
