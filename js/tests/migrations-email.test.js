// Migration 0001 (R-Z17): email links stored before R-Z5 get the thread key,
// the ISO time and the id fields R-Z5 writes, recomputed from what is stored.
// The expected shape is what the current parser writes for the same mail.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRfc822Message } from '../src/sources/email-records.js';
import {
  id,
  upgradeEmailLink,
} from '../src/storage/migrations/0001-email-threads.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { MIGRATIONS } from '../src/storage/migrations/index.js';
import { createMemoryStore } from '../src/storage/universal.js';

const mail = (headers, body = 'text') =>
  `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;

const MAILS = [
  mail([
    'Message-ID: <root@x>',
    'From: Ann <ann@x.org>',
    'To: me@x.org',
    'Subject: Hello there',
    'Date: Tue, 02 Jan 2024 10:00:00 +0000',
  ]),
  mail([
    'Message-ID: <r1@x>',
    'From: me@x.org',
    'To: ann@x.org',
    'Subject: Re: Hello there',
    'In-Reply-To: <root@x>',
    'References: <root@x>',
    'Date: Tue, 02 Jan 2024 11:00:00 +0200',
  ]),
  mail([
    'Message-ID: <r2@x>',
    'From: Ann <ann@x.org>',
    'To: me@x.org',
    'Subject: Re: Re: Hello there',
    'In-Reply-To: <r1@x>',
    'References: <root@x> <r1@x>',
    'Date: Wed, 03 Jan 2024 09:30:00 +0000',
  ]),
  mail(['From: bob@x.org', 'To: me@x.org', 'Subject: No ids at all']),
];

// The shape the mail had before R-Z5 (see the old `rfc822Chat`): the chat
// from the whole References header, else In-Reply-To, else the subject; the
// Date header as it came; none of the id fields.
const clean = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^<|>$/g, '');
const asStoredBefore = (current, text) => {
  const header = (name) =>
    text.match(new RegExp(`^${name}: (.*)$`, 'im'))?.[1] ?? '';
  const chat =
    clean(header('references')) ||
    clean(header('in-reply-to')) ||
    current.subject ||
    current.externalId;
  const old = { ...current };
  delete old.messageId;
  delete old.references;
  delete old.inReplyTo;
  delete old.bodyTree;
  old.chat = chat;
  old.chatName = current.subject || null;
  old.timestamp = header('date') || null;
  old.replyTo = clean(header('in-reply-to')) || null;
  old.children = current.children.map((c) =>
    c.startsWith('chat:email:') ? `chat:email:${chat}` : c
  );
  return old;
};

const FIELDS = [
  'chat',
  'chatName',
  'replyTo',
  'children',
  'timestamp',
  'messageId',
  'references',
  'inReplyTo',
];

test('0001 recomputes thread key, parent, time and ids exactly as R-Z5 stores them', () => {
  for (const text of MAILS) {
    const current = parseRfc822Message(text);
    const old = asStoredBefore(current, text);
    const upgraded = upgradeEmailLink(old);
    const result = upgraded ?? old;
    for (const field of FIELDS) {
      assert.deepEqual(
        result[field],
        current[field],
        `${current.subject}: ${field}`
      );
    }
    // And the move is a real one for every mail that had the old shape.
    assert.notDeepEqual(old, current);
  }
});

test('0001: the reply with two References no longer has a garbled chat', () => {
  const [, , third] = MAILS.map((text) => parseRfc822Message(text));
  const old = asStoredBefore(third, MAILS[2]);
  assert.equal(old.chat, 'root@x> <r1@x', 'the old key was garbled');
  assert.equal(upgradeEmailLink(old).chat, 'root@x');
});

test('0001 leaves mail from the providers alone but for the ISO time', () => {
  const gmail = {
    id: 'msg:email:g1',
    source: 'email',
    provider: 'gmail',
    protocol: 'gmail',
    chat: 'thread-77',
    timestamp: '2024-01-02T10:00:00.000Z',
    children: [],
  };
  assert.equal(upgradeEmailLink(gmail), null);
  const graph = {
    ...gmail,
    id: 'msg:email:g2',
    protocol: 'microsoft-graph',
    timestamp: 'Tue, 02 Jan 2024 10:00:00 GMT',
  };
  const out = upgradeEmailLink(graph);
  assert.equal(out.timestamp, '2024-01-02T10:00:00.000Z');
  assert.equal(out.chat, 'thread-77');
});

test('0001 keeps a date it cannot read, and mail without stored headers', () => {
  const odd = {
    id: 'msg:email:o',
    source: 'email',
    protocol: 'rfc822',
    chat: 'old subject',
    timestamp: 'sometime last week',
    subject: 'x',
    children: [],
  };
  assert.equal(upgradeEmailLink(odd), null);
});

test('0001 as a migration: counts, is idempotent, touches no other source', async () => {
  const store = createMemoryStore();
  const olds = MAILS.map((text) =>
    asStoredBefore(parseRfc822Message(text), text)
  );
  const other = { id: 'msg:telegram:1:1', source: 'telegram', tokens: ['x'] };
  await store.putMany([...olds, other]);
  const chain = MIGRATIONS.filter((m) => m.id === id);
  const first = await runMigrations(store, { migrations: chain });
  assert.equal(first.steps[0].changed, olds.length);
  assert.equal(first.steps[0].scanned, olds.length + 1 + 0);
  assert.deepEqual(await store.get(other.id), other);
  const snapshot = JSON.stringify(await store.query());
  const again = await runMigrations(store, { migrations: chain, from: 0 });
  assert.equal(again.steps[0].changed, 0);
  assert.equal(
    JSON.stringify((await store.query()).filter((l) => l.id !== 'meta:schema')),
    JSON.stringify(JSON.parse(snapshot).filter((l) => l.id !== 'meta:schema'))
  );
  // The first root and its two replies are now one conversation.
  const chats = new Set(
    (await store.query((l) => l.source === 'email'))
      .filter((l) => l.subject?.includes('Hello'))
      .map((l) => l.chat)
  );
  assert.deepEqual([...chats], ['root@x']);
});
