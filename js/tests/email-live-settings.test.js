// The email adapter as the app uses it (R-Z5): the connection saved on the
// Connections screen is really used, Chat can answer a mail thread, read
// and delete reach the provider, replies carry the thread's ids, JMAP
// uses real mailbox and identity ids, and a pull does not fetch again.
// Fakes only; no network and no account.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { emailSource } from '../src/sources/email.js';
import '../src/sources/email-node-transport.js';
import { createMemoryStore } from '../src/storage/index.js';
import { writeFailed } from '../src/storage/write-queue.js';
import {
  getSource,
  liveOptionsFrom,
  pullLiveInto,
} from '../src/sources/index.js';
import { createAdapterSender } from '../src/crm/reengage.js';
import { createMessageActions } from '../src/sources/message-actions.js';
import { emailConfig } from '../src/server/routes-email.js';
import { imapScript, smtpScript, startServer } from './helpers/mail-fakes.mjs';

const secret = (store, name, value) =>
  store.put({ id: `secret:email:${name}`, token: value });

const incoming = {
  id: 'msg:email:root@example.com',
  source: 'email',
  chat: 'root@example.com',
  sender: 'anna@example.com',
  from: [{ name: 'Anna', address: 'anna@example.com' }],
  to: [{ address: 'me@example.com' }],
  subject: 'Lunch?',
  body: 'Are we on?',
  timestamp: '2026-10-24T09:00:00.000Z',
  messageId: 'root@example.com',
  references: [],
};

const reply = {
  ...incoming,
  id: 'msg:email:r2@example.com',
  messageId: 'r2@example.com',
  inReplyTo: 'root@example.com',
  references: ['root@example.com'],
  subject: 'Re: Lunch?',
  timestamp: '2026-10-24T09:30:00.000Z',
};

const fakeFetch = (handlers) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      url: u,
      method: init.method ?? 'GET',
      body,
      headers: init.headers,
    });
    const handler = handlers.find((h) => h.match(u, init, body));
    const data = handler ? handler.reply(u, body, init) : {};
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(data),
    };
  };
  fn.calls = calls;
  return fn;
};

describe('the saved Connections settings are used', () => {
  it('liveOptionsFrom reads host, login, password and the rest', async () => {
    const store = createMemoryStore();
    await secret(store, 'host', 'imap.example.com');
    await secret(store, 'username', 'me@example.com');
    await secret(store, 'password', 'app-password');
    await secret(store, 'access-token', 'tok');
    const options = await liveOptionsFrom(store, 'email');
    assert.equal(options.host, 'imap.example.com');
    assert.equal(options.username, 'me@example.com');
    assert.equal(options.password, 'app-password');
    assert.equal(options.token, 'tok');
    assert.equal(typeof options.sync.get, 'function');
    assert.equal(typeof options.lookup.thread, 'function');
    // Other networks get none of it.
    assert.equal((await liveOptionsFrom(store, 'github')).host, undefined);
  });

  it('a pull from the page uses them, then fetches only what is new', async () => {
    const store = createMemoryStore();
    const script = imapScript({ uids: [1, 2] });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      await secret(store, 'host', '127.0.0.1');
      await secret(store, 'port', String(server.port));
      await secret(store, 'security', 'none');
      await secret(store, 'username', 'alice');
      await secret(store, 'password', 'secret');
      const first = await pullLiveInto(store, 'email', {});
      assert.equal(first.imported, 2);
      assert.ok(script.calls.some((c) => c.includes('LOGIN "alice" "secret"')));
      const state = await store.get('sync:email:imap:alice@127.0.0.1:INBOX');
      assert.deepEqual(state.state, { uidValidity: 7, lastUid: 2 });

      script.calls.length = 0;
      const again = await pullLiveInto(store, 'email', {});
      assert.equal(again.imported, 0);
      assert.ok(!script.calls.some((c) => c.includes('BODY.PEEK')));
    } finally {
      await server.close();
    }
  });

  for (const [label, fail] of [
    ['a failed write', () => new Error('disk full')],
    [
      'STORE_WRITE_FAILED (R-Z14)',
      () => writeFailed(Object.assign(new Error('full'), { code: 'ENOSPC' })),
    ],
  ]) {
    it(`the cursor is only written after the mail is stored: ${label}`, async () => {
      const store = createMemoryStore();
      const failing = {
        ...store,
        put: async () => {
          throw fail();
        },
        putMany: async () => {
          throw fail();
        },
        get: store.get,
        query: store.query,
      };
      const script = imapScript({ uids: [1] });
      const server = await startServer({
        greeting: '* OK ready\r\n',
        onLine: script.onLine,
      });
      try {
        await secret(store, 'host', '127.0.0.1');
        await secret(store, 'port', String(server.port));
        await secret(store, 'security', 'none');
        await secret(store, 'username', 'alice');
        await secret(store, 'password', 'secret');
        await assert.rejects(
          pullLiveInto(failing, 'email', {}),
          fail().code ? { code: 'STORE_WRITE_FAILED' } : /disk full/
        );
        assert.equal(
          await store.get('sync:email:imap:alice@127.0.0.1:INBOX'),
          null
        );
      } finally {
        await server.close();
      }
    });
  }

  it('does not hand saved credentials to another server named in a request', async () => {
    const store = createMemoryStore();
    await secret(store, 'host', 'imap.example.com');
    await secret(store, 'username', 'me@example.com');
    await secret(store, 'password', 'app-password');
    await secret(store, 'access-token', 'tok');
    const same = await emailConfig(store, { host: 'imap.example.com' });
    assert.equal(same.password, 'app-password');
    const other = await emailConfig(store, { host: 'evil.example.net' });
    assert.equal(other.host, 'evil.example.net');
    assert.equal(other.password, undefined);
    assert.equal(other.username, undefined);
    assert.equal(other.token, null);
    const asked = await emailConfig(store, {
      baseUrl: 'https://evil.example.net/jmap',
    });
    assert.equal(asked.token, null);
  });
});

describe('Chat can answer a mail thread', () => {
  it('sends the composer text as a reply over SMTP with the thread ids', async () => {
    const store = createMemoryStore();
    await store.put(incoming);
    await store.put(reply);
    const script = smtpScript();
    const server = await startServer({
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      await secret(store, 'host', 'imap.example.com');
      await secret(store, 'smtp-host', '127.0.0.1');
      await secret(store, 'smtp-port', String(server.port));
      await secret(store, 'smtp-security', 'none');
      await secret(store, 'username', 'me@example.com');
      await secret(store, 'password', 'secret');
      const send = createAdapterSender({
        getSource,
        options: { email: await liveOptionsFrom(store, 'email') },
      });
      // What the composer gives: the chat, and no address.
      await send({
        source: 'email',
        chat: 'root@example.com',
        text: 'Yes, noon!',
      });
      assert.ok(server.seen.includes('MAIL FROM:<me@example.com>'));
      assert.ok(server.seen.includes('RCPT TO:<anna@example.com>'));
      const data = script.data.join('\n');
      assert.match(data, /^Subject: Re: Lunch\?$/m);
      assert.match(data, /^In-Reply-To: <r2@example\.com>$/m);
      assert.match(
        data,
        /^References: <root@example\.com>\n <r2@example\.com>$/m
      );
      assert.match(data, /Yes, noon!/);
    } finally {
      await server.close();
    }
  });

  it('answers the Reply-To address when the mail has one', async () => {
    const store = createMemoryStore();
    await store.put({
      ...incoming,
      rawHeaders: { 'reply-to': ['Lists <list@example.org>'] },
    });
    const thread = await (
      await liveOptionsFrom(store, 'email')
    ).lookup.thread('root@example.com', { username: 'me@example.com' });
    assert.deepEqual(thread.to, [
      { name: 'Lists', address: 'list@example.org' },
    ]);
  });

  it('fails loudly when it has nobody to send to', async () => {
    const store = createMemoryStore();
    const send = createAdapterSender({
      getSource,
      options: {
        email: {
          ...(await liveOptionsFrom(store, 'email')),
          host: '127.0.0.1',
          security: 'none',
        },
      },
    });
    await assert.rejects(
      send({ source: 'email', chat: 'nothing@x.org', text: 'hi' }),
      (error) => error.code === 'no-recipient' && error.fallback === false
    );
  });
});

describe('mark read and delete reach the provider', () => {
  const gmail = (fetchImpl) => ({
    token: 'tok',
    protocol: 'gmail',
    fetchImpl,
    baseUrl: 'https://gmail.test',
  });

  it('emailSource.live has them', () => {
    for (const name of ['pullMessages', 'post', 'markRead', 'deleteMessages']) {
      assert.equal(typeof emailSource.live[name], 'function', name);
    }
  });

  it('/api/message/read finds markRead and marks the Gmail message', async () => {
    const fetchImpl = fakeFetch([]);
    const actions = createMessageActions({
      getSource,
      optionsFor: async () => gmail(fetchImpl),
    });
    const link = { id: 'msg:email:gm1', raw: { id: 'gm1' } };
    const result = await actions.perform('read', {
      source: 'email',
      chat: 't1',
      id: 'gm1',
      link,
    });
    assert.equal(result.via, 'api');
    const call = fetchImpl.calls[0];
    assert.equal(call.url.pathname, '/gmail/v1/users/me/messages/gm1/modify');
    assert.deepEqual(call.body, { removeLabelIds: ['UNREAD'] });
  });

  it('reading a whole chat marks its incoming mail', async () => {
    const store = createMemoryStore();
    await store.put({ ...incoming, id: 'msg:email:g1', raw: { id: 'g1' } });
    await store.put({ ...reply, id: 'msg:email:g2', raw: { id: 'g2' } });
    await store.put({
      ...reply,
      id: 'msg:email:g3',
      outgoing: true,
      raw: { id: 'g3' },
    });
    const fetchImpl = fakeFetch([]);
    const options = {
      ...(await liveOptionsFrom(store, 'email')),
      ...gmail(fetchImpl),
    };
    await emailSource.live.markRead({ chat: 'root@example.com' }, options);
    assert.deepEqual(fetchImpl.calls.map((c) => c.url.pathname).sort(), [
      '/gmail/v1/users/me/messages/g1/modify',
      '/gmail/v1/users/me/messages/g2/modify',
    ]);
  });

  it('/api/message/delete trashes the Gmail message', async () => {
    const fetchImpl = fakeFetch([]);
    const actions = createMessageActions({
      getSource,
      optionsFor: async () => gmail(fetchImpl),
    });
    await actions.perform('delete', {
      source: 'email',
      chat: 't1',
      ids: ['gm9'],
      links: [{ id: 'msg:email:gm9', raw: { id: 'gm9' } }],
    });
    assert.equal(
      fetchImpl.calls[0].url.pathname,
      '/gmail/v1/users/me/messages/gm9/trash'
    );
  });

  it('marks IMAP mail read through the local transport', async () => {
    const script = imapScript({ uids: [42] });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const actions = createMessageActions({
        getSource,
        optionsFor: async () => ({
          host: '127.0.0.1',
          port: server.port,
          security: 'none',
          username: 'alice',
          password: 'secret',
        }),
      });
      await actions.perform('read', {
        source: 'email',
        chat: 'c',
        link: {
          id: 'msg:email:x',
          raw: { uid: 42, mailbox: 'INBOX', uidValidity: 7 },
        },
      });
      assert.ok(
        script.calls.some((c) =>
          c.endsWith('UID STORE 42 +FLAGS.SILENT (\\Seen)')
        )
      );
    } finally {
      await server.close();
    }
  });
});

const thread = {
  chat: 'T1',
  to: [{ address: 'anna@example.com' }],
  text: 'ok',
};
const lookup = {
  thread: async () => ({
    to: [{ address: 'anna@example.com' }],
    subject: 'Re: Lunch?',
    messageId: 'last@example.com',
    references: ['root@example.com'],
    providerId: 'prov-9',
    threadId: 'T1',
  }),
};

describe('replies keep the conversation', () => {
  it('Gmail: threadId, In-Reply-To and References', async () => {
    const fetchImpl = fakeFetch([]);
    await emailSource.live.post(thread, {
      token: 'tok',
      protocol: 'gmail',
      fetchImpl,
      baseUrl: 'https://gmail.test',
      lookup,
      username: 'me@example.com',
    });
    const body = fetchImpl.calls[0].body;
    assert.equal(body.threadId, 'T1');
    const raw = Buffer.from(
      body.raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString();
    assert.match(raw, /^In-Reply-To: <last@example\.com>$/m);
    assert.match(
      raw,
      /^References: <root@example\.com>\r\n <last@example\.com>$/m
    );
    assert.match(raw, /^Subject: Re: Lunch\?$/m);
  });

  it('Graph: uses the reply call so it stays in the conversation', async () => {
    const fetchImpl = fakeFetch([]);
    await emailSource.live.post(
      { chat: 'C1', text: 'ok' },
      {
        token: 'tok',
        protocol: 'microsoft-graph',
        fetchImpl,
        baseUrl: 'https://graph.test/v1.0',
        lookup,
      }
    );
    const call = fetchImpl.calls[0];
    assert.equal(call.url.pathname, '/v1.0/me/messages/prov-9/reply');
    assert.deepEqual(call.body, { comment: 'ok' });
  });
});

describe('replies keep the conversation in JMAP', () => {
  it('JMAP: finds the account from its session, uses real ids, sets inReplyTo', async () => {
    const fetchImpl = fakeFetch([
      {
        match: (u) => u.pathname === '/.well-known/jmap',
        reply: () => ({
          apiUrl: 'https://jmap.test/api/',
          primaryAccounts: { 'urn:ietf:params:jmap:mail': 'acc-77' },
          accounts: { 'acc-77': {} },
        }),
      },
      {
        match: (u, _i, body) => body?.methodCalls?.[0]?.[0] === 'Mailbox/get',
        reply: () => ({
          methodResponses: [
            [
              'Mailbox/get',
              {
                list: [
                  { id: 'MB-inbox', role: 'inbox' },
                  { id: 'MB-drafts', role: 'drafts' },
                  { id: 'MB-sent', role: 'sent' },
                  { id: 'MB-trash', role: 'trash' },
                ],
              },
              'm',
            ],
            [
              'Identity/get',
              {
                list: [
                  { id: 'ID-other', email: 'other@example.com' },
                  { id: 'ID-me', email: 'me@example.com' },
                ],
              },
              'i',
            ],
          ],
        }),
      },
      { match: () => true, reply: () => ({ methodResponses: [] }) },
    ]);
    await emailSource.live.post(
      { chat: 'T1', text: 'ok', from: 'me@example.com' },
      {
        token: 'tok',
        protocol: 'jmap',
        fetchImpl,
        baseUrl: 'https://jmap.test',
        lookup,
      }
    );
    const send = fetchImpl.calls.at(-1).body.methodCalls;
    assert.equal(fetchImpl.calls.at(-1).url.href, 'https://jmap.test/api/');
    const [, set] = send[0];
    assert.equal(set.accountId, 'acc-77');
    assert.deepEqual(Object.keys(set.create.draft.mailboxIds), ['MB-drafts']);
    assert.deepEqual(set.create.draft.inReplyTo, ['last@example.com']);
    assert.deepEqual(set.create.draft.references, [
      'root@example.com',
      'last@example.com',
    ]);
    const [, submit] = send[1];
    assert.equal(submit.create.send.identityId, 'ID-me');
    assert.equal(
      submit.onSuccessUpdateEmail['#send']['mailboxIds/MB-sent'],
      true
    );
    assert.equal(submit.onSuccessUpdateEmail['#send']['keywords/$draft'], null);
  });

  it('JMAP: a refused send is an error, and delete moves to the trash by role', async () => {
    const boxes = {
      match: (u, _i, body) => body?.methodCalls?.[0]?.[0] === 'Mailbox/get',
      reply: () => ({
        methodResponses: [
          [
            'Mailbox/get',
            {
              list: [
                { id: 'MB-d', role: 'drafts' },
                { id: 'MB-t', role: 'trash' },
              ],
            },
            'm',
          ],
          [
            'Identity/get',
            { list: [{ id: 'ID-1', email: 'me@example.com' }] },
            'i',
          ],
        ],
      }),
    };
    const refused = fakeFetch([
      boxes,
      {
        match: () => true,
        reply: () => ({
          methodResponses: [
            [
              'EmailSubmission/set',
              { notCreated: { send: { type: 'forbiddenFrom' } } },
              's',
            ],
          ],
        }),
      },
    ]);
    const options = {
      token: 'tok',
      protocol: 'jmap',
      accountId: 'acc',
      baseUrl: 'https://jmap.test/api',
    };
    await assert.rejects(
      emailSource.live.post(
        { to: 'a@example.com', text: 'x' },
        { ...options, fetchImpl: refused }
      ),
      (error) => error.code === 'jmap-refused'
    );
    const fine = fakeFetch([
      boxes,
      { match: () => true, reply: () => ({ methodResponses: [] }) },
    ]);
    await emailSource.live.deleteMessages(
      { ids: ['e1'] },
      { ...options, fetchImpl: fine }
    );
    const update = fine.calls.at(-1).body.methodCalls[0][1].update;
    assert.deepEqual(update, { e1: { mailboxIds: { 'MB-t': true } } });
  });
});

describe('API pulls do not download again', () => {
  it('Gmail skips a message that is already stored', async () => {
    const fetchImpl = fakeFetch([
      {
        match: (u) => u.pathname.endsWith('/messages'),
        reply: () => ({ messages: [{ id: 'old' }, { id: 'fresh' }] }),
      },
      {
        match: () => true,
        reply: (u) => ({
          id: u.pathname.split('/').pop(),
          threadId: 't',
          payload: {
            headers: [{ name: 'From', value: 'a@b.c' }],
            body: { data: 'aGk' },
          },
        }),
      },
    ]);
    const result = await emailSource.live.pullMessages({
      token: 'tok',
      protocol: 'gmail',
      fetchImpl,
      baseUrl: 'https://gmail.test',
      sync: { has: async (id) => id === 'msg:email:old' },
    });
    assert.deepEqual(
      result.links.map((l) => l.id),
      ['msg:email:fresh']
    );
    assert.equal(fetchImpl.calls.length, 2);
  });

  it('Graph asks only for mail newer than the last one seen', async () => {
    const fetchImpl = fakeFetch([
      {
        match: () => true,
        reply: () => ({
          value: [
            {
              id: 'a',
              subject: 's',
              receivedDateTime: '2026-10-24T10:00:00Z',
              body: { content: 'x' },
            },
            {
              id: 'b',
              subject: 's',
              receivedDateTime: '2026-10-24T11:00:00Z',
              body: { content: 'y' },
            },
          ],
        }),
      },
    ]);
    const saved = new Map();
    const sync = {
      get: async (k) => saved.get(k) ?? null,
      set: async (k, v) => saved.set(k, v),
      has: async () => false,
    };
    const options = {
      token: 'tok',
      protocol: 'microsoft-graph',
      fetchImpl,
      baseUrl: 'https://graph.test/v1.0',
      sync,
    };
    const first = await emailSource.live.pullMessages(options);
    assert.equal(fetchImpl.calls[0].url.searchParams.get('$filter'), null);
    await first.afterStore();
    await emailSource.live.pullMessages(options);
    assert.equal(
      fetchImpl.calls[1].url.searchParams.get('$filter'),
      'receivedDateTime gt 2026-10-24T11:00:00Z'
    );
  });
});
