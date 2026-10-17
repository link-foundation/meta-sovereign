// Unit tests for js/src/web/message-parts.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  strippedJpegDataUrl,
  serviceInfo,
  parseMessageParts,
} from '../src/web/message-parts.js';

// ---- strippedJpegDataUrl ------------------------------------------------

test('strippedJpegDataUrl: returns null for invalid input', () => {
  assert.equal(strippedJpegDataUrl(null), null);
  assert.equal(strippedJpegDataUrl(''), null);
  assert.equal(strippedJpegDataUrl(42), null);
});

test('strippedJpegDataUrl: returns null for non-stripped bytes', () => {
  // First byte after decode is not 0x01
  const buf = Buffer.from([0x02, 0x10, 0x10, 0xff, 0xff]);
  assert.equal(strippedJpegDataUrl(buf.toString('base64')), null);
});

test('strippedJpegDataUrl: rebuilds JPEG from stripped bytes', () => {
  // Minimal stripped payload: byte 0 = 0x01, w=16, h=16, then a few DCT bytes
  const payload = Buffer.from([0x01, 0x10, 0x10, 0x00, 0x11, 0x22]);
  const b64 = payload.toString('base64');
  const url = strippedJpegDataUrl(b64);
  assert.ok(url, 'should return a string');
  assert.ok(
    url.startsWith('data:image/jpeg;base64,'),
    'should be JPEG data URL'
  );
  // Decode and check JPEG SOI marker and JFIF APP0 marker
  const decoded = Buffer.from(
    url.slice('data:image/jpeg;base64,'.length),
    'base64'
  );
  assert.equal(decoded[0], 0xff);
  assert.equal(decoded[1], 0xd8); // JPEG SOI
  // Width and height bytes are patched at positions 164 and 166
  assert.equal(decoded[164], 0x10); // width = 16
  assert.equal(decoded[166], 0x10); // height = 16
});

// ---- serviceInfo --------------------------------------------------------

test('serviceInfo: returns null for non-service messages', () => {
  assert.equal(serviceInfo({}), null);
  assert.equal(serviceInfo({ body: 'hello' }), null);
});

test('serviceInfo: join action', () => {
  const link = {
    service: 'MessageActionChatAddUser',
    senderName: 'Alice',
    raw: { action: {} },
  };
  const info = serviceInfo(link);
  assert.equal(info.key, 'chat.service.join');
  assert.equal(info.user, 'Alice');
});

test('serviceInfo: pin action', () => {
  const info = serviceInfo({ service: 'MessageActionPinMessage', raw: {} });
  assert.equal(info.key, 'chat.service.pin');
});

test('serviceInfo: unknown action gets fallback key', () => {
  const info = serviceInfo({ service: 'MessageActionUnknownXYZ', raw: {} });
  assert.equal(info.key, 'chat.service.unknown');
});

// ---- parseMessageParts --------------------------------------------------

const makeLink = (extra = {}) => ({
  id: 'msg:telegram:123:42',
  source: 'telegram',
  chat: '123',
  body: 'hello',
  sender: 'alice',
  senderName: 'Alice',
  ...extra,
});

test('parseMessageParts: plain text', () => {
  const parts = parseMessageParts(makeLink());
  assert.equal(parts.text, 'hello');
  assert.deepEqual(parts.entities, []);
  assert.equal(parts.media, null);
  assert.equal(parts.replyRef, null);
  assert.equal(parts.fwdFrom, null);
  assert.deepEqual(parts.reactions, []);
  assert.equal(parts.edited, false);
  assert.equal(parts.album, null);
  assert.equal(parts.service, null);
});

test('parseMessageParts: photo media', () => {
  const raw = {
    media: {
      className: 'MessageMediaPhoto',
      photo: {
        id: '999',
        accessHash: 'aaa',
        dcId: 5,
        sizes: [
          {
            className: 'PhotoStrippedSize',
            type: 'i',
            bytes: { bytes: 'AQEB' },
          },
          { className: 'PhotoSize', type: 'm', w: 320, h: 240, size: 12345 },
        ],
      },
    },
  };
  const parts = parseMessageParts(makeLink({ raw, body: '' }));
  assert.equal(parts.media?.kind, 'photo');
  assert.equal(parts.media?.dcId, 5);
  assert.ok(parts.media?.aspectRatio > 0);
  // 320/240 = 1.333...
  assert.ok(Math.abs(parts.media.aspectRatio - 320 / 240) < 0.01);
});

test('parseMessageParts: reply reference resolved', () => {
  const repliedLink = {
    id: 'msg:telegram:123:10',
    body: 'the original',
    sender: 'bob',
    senderName: 'Bob',
  };
  const msgMap = new Map([[repliedLink.id, repliedLink]]);
  const raw = { replyTo: { replyToMsgId: 10 } };
  const parts = parseMessageParts(makeLink({ raw }), msgMap);
  assert.ok(parts.replyRef, 'should have replyRef');
  assert.equal(parts.replyRef.msgId, 10);
  assert.equal(parts.replyRef.text, 'the original');
  assert.equal(parts.replyRef.senderName, 'Bob');
});

test('parseMessageParts: reply reference not loaded', () => {
  const raw = { replyTo: { replyToMsgId: 99 } };
  const parts = parseMessageParts(makeLink({ raw }));
  assert.ok(parts.replyRef, 'should have replyRef');
  assert.equal(parts.replyRef.msgId, 99);
  assert.equal(parts.replyRef.text, null);
});

test('parseMessageParts: forward header', () => {
  const raw = { fwdFrom: { fromName: 'Channel Name', date: 1234567890 } };
  const parts = parseMessageParts(makeLink({ raw }));
  assert.equal(parts.fwdFrom?.fromName, 'Channel Name');
});

test('parseMessageParts: reactions', () => {
  const raw = {
    reactions: {
      results: [
        { reaction: { className: 'ReactionEmoji', emoticon: '👍' }, count: 5 },
        { reaction: { className: 'ReactionEmoji', emoticon: '❤️' }, count: 2 },
        {
          reaction: { className: 'ReactionCustomEmoji', documentId: 'x' },
          count: 1,
        },
      ],
    },
  };
  const parts = parseMessageParts(makeLink({ raw }));
  // Custom emoji reactions are filtered out
  assert.equal(parts.reactions.length, 2);
  assert.equal(parts.reactions[0].emoticon, '👍');
  assert.equal(parts.reactions[0].count, 5);
});

test('parseMessageParts: edited flag from raw.editDate', () => {
  const raw = { editDate: 1234567890 };
  const parts = parseMessageParts(makeLink({ raw }));
  assert.equal(parts.edited, true);
});

test('parseMessageParts: album groupId', () => {
  const raw = { groupedId: '7890123456' };
  const parts = parseMessageParts(makeLink({ raw }));
  assert.equal(parts.album, '7890123456');
});

test('parseMessageParts: service join message', () => {
  const link = {
    id: 'msg:telegram:123:50',
    chat: '123',
    body: '',
    service: 'MessageActionChatAddUser',
    senderName: 'Alice',
    raw: { action: {} },
  };
  const parts = parseMessageParts(link);
  assert.ok(parts.service);
  assert.equal(parts.service.key, 'chat.service.join');
});

test('parseMessageParts: document', () => {
  const raw = {
    media: {
      className: 'MessageMediaDocument',
      document: {
        mimeType: 'application/pdf',
        size: 102400,
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'report.pdf' },
        ],
      },
    },
  };
  const parts = parseMessageParts(makeLink({ raw, body: '' }));
  assert.equal(parts.media?.kind, 'document');
  assert.equal(parts.media?.filename, 'report.pdf');
  assert.equal(parts.media?.mimeType, 'application/pdf');
});

test('parseMessageParts: webpage preview', () => {
  const raw = {
    media: {
      className: 'MessageMediaWebPage',
      webpage: {
        url: 'https://example.com',
        title: 'Example',
        description: 'An example page',
        siteName: 'Example.com',
      },
    },
  };
  const parts = parseMessageParts(makeLink({ raw }));
  assert.equal(parts.media?.kind, 'webpage');
  assert.equal(parts.media?.title, 'Example');
});
