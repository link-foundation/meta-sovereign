// Mail sends over HTTP APIs and the attachment folder (R-Z5): a Gmail,
// Graph or JMAP send that fails after the request left is `send-unknown`
// (never retried, no fallback); a clear refusal is not. Attachment files and
// folders are private; the attachment route needs the local Host.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createEmailLive } from '../src/sources/email.js';
import { createAttachmentStore } from '../src/server/email-attachments.js';
import { startServer } from '../src/server/index.js';

const reply = (status, body = {}) => ({
  ok: status < 400,
  status,
  statusText: status < 400 ? 'OK' : 'Error',
  headers: new Map([['Content-Type', 'application/json']]),
  text: async () => JSON.stringify(body),
});

const content = { from: 'a@x.test', to: 'b@x.test', subject: 's', text: 't' };

const sendWith = (protocol, fetchImpl) =>
  createEmailLive({
    protocol,
    fetchImpl,
    baseUrl: 'https://mail.test',
  }).post(content, { token: 't' });

const isUnknown = (error) =>
  error.code === 'send-unknown' &&
  error.outcome === 'unknown' &&
  error.fallback === false &&
  error.ambiguous === true &&
  error.safeToRetry === false;

// JMAP: the session and mailbox lookups succeed, the send itself fails.
const jmapFetch = (failure) => async (url, init) => {
  if (String(url).endsWith('/.well-known/jmap')) {
    return reply(200, {
      apiUrl: 'https://mail.test/api',
      primaryAccounts: { 'urn:ietf:params:jmap:mail': 'acc' },
    });
  }
  const calls = JSON.parse(init.body).methodCalls;
  if (calls[0][0] === 'Mailbox/get') {
    return reply(200, {
      methodResponses: [
        ['Mailbox/get', { list: [{ id: 'd', role: 'drafts' }] }, 'm'],
        ['Identity/get', { list: [{ id: 'i', email: 'a@x.test' }] }, 'i'],
      ],
    });
  }
  return failure();
};

const providers = {
  gmail: (failure) => async () => failure(),
  'microsoft-graph': (failure) => async () => failure(),
  jmap: jmapFetch,
};

describe('HTTP mail sends that may have been delivered', () => {
  for (const protocol of Object.keys(providers)) {
    for (const [label, failure] of [
      ['a 503 after sending', () => reply(503)],
      ['a 500 after sending', () => reply(500)],
      [
        'a reset connection',
        () => {
          throw Object.assign(new Error('socket hang up'), {
            code: 'ECONNRESET',
          });
        },
      ],
      [
        'a timeout',
        () => {
          throw Object.assign(new Error('timed out'), {
            name: 'TimeoutError',
          });
        },
      ],
    ]) {
      it(`${protocol}: ${label} is send-unknown and sent once`, async () => {
        let sends = 0;
        const base = providers[protocol](() => {
          sends += 1;
          return failure();
        });
        await assert.rejects(sendWith(protocol, base), isUnknown);
        assert.equal(sends, 1);
      });
    }
    it(`${protocol}: a clear refusal is not send-unknown`, async () => {
      const base = providers[protocol](() => reply(400, { error: 'bad' }));
      await assert.rejects(
        sendWith(protocol, base),
        (error) => error.code !== 'send-unknown' && error.safeToRetry === true
      );
    });
  }
});

describe('attachment files are private', () => {
  it('writes files 0600 and folders 0700', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'ms-email-mode-'));
    const dir = path.join(base, 'media', 'email');
    const hash = createAttachmentStore(dir).save(Buffer.from('bytes'));
    assert.equal((await stat(path.join(dir, hash))).mode & 0o777, 0o600);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
  });
});

describe('/api/email/attachment guards', () => {
  const get = (port, target, host) =>
    new Promise((resolve, reject) => {
      http
        .get(
          { host: '127.0.0.1', port, path: target, headers: { host } },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          }
        )
        .on('error', reject);
    });

  it('answers a foreign Host header with an error, before anything else', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-email-host-'));
    const server = await startServer({
      port: 0,
      storeDir: dir,
      emailPoll: false,
    });
    try {
      const target = '/api/email/attachment?id=msg%3Aemail%3Ax&n=0';
      assert.equal(await get(server.port, target, 'evil.example'), 421);
      assert.equal(
        await get(server.port, target, `127.0.0.1:${server.port}`),
        404
      );
    } finally {
      await server.close();
    }
  });

  it('accepts only hex names and keeps them inside the folder', () => {
    const files = createAttachmentStore('/tmp/ms-email-never-written');
    const hex = 'a'.repeat(64);
    assert.notEqual(files.pathOf(hex), null);
    for (const bad of [
      `../${hex}`,
      `${hex}/../${hex}`,
      '..',
      'g'.repeat(64),
      hex.toUpperCase(),
      hex.slice(1),
    ]) {
      assert.equal(files.pathOf(bad), null);
    }
  });
});
