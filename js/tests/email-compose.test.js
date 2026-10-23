// What goes out (R-Z5): no Bcc header, no header injection, RFC 2047
// subjects and names, a correctly encoded body, RFC 5322 Date and
// Message-ID, and the reply ids. Nothing touches a network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRfc822,
  composeMessage,
  parseRfc822Message,
} from '../src/sources/email.js';
import { rfc5322Date } from '../src/sources/email-compose.js';

const NOW = new Date('2026-10-24T10:05:07Z');

describe('composeMessage', () => {
  it('never writes the Bcc into the message, but keeps it for the envelope', () => {
    const { raw, recipients } = composeMessage(
      {
        from: 'me@example.com',
        to: 'a@example.com',
        cc: 'c@example.com',
        bcc: ['secret@example.com', 'other@example.com'],
        subject: 'Hi',
        text: 'x',
      },
      { now: NOW }
    );
    assert.doesNotMatch(raw, /bcc/i);
    assert.doesNotMatch(raw, /secret@example\.com/);
    assert.deepEqual(recipients, [
      'a@example.com',
      'c@example.com',
      'secret@example.com',
      'other@example.com',
    ]);
    assert.equal(
      buildRfc822({ to: 'a@x.org', bcc: 'z@x.org' }).includes('z@x.org'),
      false
    );
  });

  it('cannot be made to add a header through a subject, a name or an address', () => {
    const { raw } = composeMessage(
      {
        from: { name: 'Evil\r\nBcc: e@x.org', address: 'me@example.com' },
        to: 'a@example.com',
        subject: 'Hello\r\nBcc: evil@x.org\nX-Injected: 1',
        text: 'x',
      },
      { now: NOW }
    );
    const head = raw.split('\r\n\r\n')[0];
    assert.doesNotMatch(head, /^Bcc:/im);
    assert.doesNotMatch(head, /^X-Injected:/im);
    assert.equal(
      head.split('\r\n').filter((l) => /^Subject:/i.test(l)).length,
      1
    );
  });

  it('refuses an address with a line break or a space in it', () => {
    for (const bad of ['a@x.org\r\nBcc: e@x.org', 'a@x.org\nb@x.org', 'nope']) {
      assert.throws(
        () => composeMessage({ to: bad, text: 'x' }),
        (error) => error.code === 'bad-address'
      );
    }
    assert.throws(
      () => composeMessage({ to: { address: 'a b@x.org' }, text: 'x' }),
      (error) => error.code === 'bad-address'
    );
    assert.throws(() => composeMessage({ to: [], text: 'x' }), /recipient/);
  });

  it('encodes a non-ASCII subject and display names (RFC 2047) and parses back', () => {
    const { raw } = composeMessage(
      {
        from: { name: 'Анна Петрова', address: 'anna@example.com' },
        to: [{ name: 'Бoб, Jr.', address: 'bob@example.com' }],
        subject: 'Привет, мир — long subject '.repeat(4),
        text: 'Привет!\nВторая строка',
      },
      { now: NOW }
    );
    assert.match(raw, /^Subject: =\?UTF-8\?B\?/m);
    assert.match(raw, /^From: =\?UTF-8\?B\?/m);
    assert.ok(
      [...raw].every((c) => c.charCodeAt(0) < 128),
      'ASCII on the wire'
    );
    for (const line of raw.split('\r\n')) {
      assert.ok(line.length <= 998);
    }
    assert.match(raw, /Content-Type: text\/plain; charset=utf-8/);
    assert.match(raw, /Content-Transfer-Encoding: base64/);
    const link = parseRfc822Message(Buffer.from(raw));
    assert.equal(link.subject, 'Привет, мир — long subject '.repeat(4).trim());
    assert.equal(link.senderName, 'Анна Петрова');
    assert.equal(link.body, 'Привет!\r\nВторая строка');
    assert.equal(link.to[0].name, 'Бoб, Jr.');
  });

  it('writes an ASCII body as 7bit and quotes a display name with specials', () => {
    const { raw } = composeMessage(
      {
        from: '"Doe, John" <john@example.com>',
        to: 'a@example.com',
        text: 'plain\n.dot line',
      },
      { now: NOW }
    );
    assert.match(raw, /Content-Transfer-Encoding: 7bit/);
    assert.match(raw, /^From: "Doe, John" <john@example.com>$/m);
    assert.match(raw, /plain\r\n\.dot line$/);
  });

  it('sets an RFC 5322 Date and a Message-ID on the sender domain', () => {
    const { raw, messageId } = composeMessage(
      { from: 'me@mail.example.org', to: 'a@example.com', text: 'x' },
      { now: NOW }
    );
    assert.match(raw, /^Date: Sat, 24 Oct 2026 10:05:07 \+0000$/m);
    assert.equal(
      rfc5322Date(new Date('2026-01-02T03:04:05Z')),
      'Fri, 02 Jan 2026 03:04:05 +0000'
    );
    assert.match(messageId, /^<[0-9a-f]{20,}@mail\.example\.org>$/);
    assert.ok(raw.includes(`Message-ID: ${messageId}`));
    const again = composeMessage({ to: 'a@example.com', text: 'x' });
    assert.notEqual(again.messageId, messageId);
  });

  it('carries In-Reply-To and References for a reply', () => {
    const { raw } = composeMessage(
      {
        to: 'a@example.com',
        subject: 'Re: Hi',
        text: 'x',
        inReplyTo: 'b@x.org',
        references: ['a@x.org', '<b@x.org>'],
      },
      { now: NOW }
    );
    assert.match(raw, /^In-Reply-To: <b@x\.org>$/m);
    assert.match(raw, /^References: <a@x\.org>\r\n <b@x\.org>$/m);
    const link = parseRfc822Message(Buffer.from(raw));
    assert.equal(link.chat, 'a@x.org');
    assert.equal(link.replyTo, 'b@x.org');
  });
});
