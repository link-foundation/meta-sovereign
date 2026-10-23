// The pure parts of editing a message in the box (R-Y146).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editBody,
  editOutcome,
  editableText,
  hasMedia,
} from '../src/web/chat-edit-mode.js';
import { canEdit } from '../src/web/chat-selection.js';
import { lastEditable } from '../src/web/chat-actions.js';

const text = (body, extra = {}) => ({
  id: 'msg:telegram:1:5',
  source: 'telegram',
  sender: 'me',
  body,
  raw: { id: 5 },
  ...extra,
});
const photo = (body) =>
  text(body, {
    raw: {
      id: 5,
      media: { className: 'MessageMediaPhoto', photo: { sizes: [] } },
    },
  });

test('the box gets the message as markdown', () => {
  const bold = text('hello world', {
    raw: {
      id: 5,
      entities: [{ className: 'MessageEntityBold', offset: 6, length: 5 }],
    },
  });
  assert.equal(editableText(bold), 'hello **world**');
  assert.equal(editableText(text('plain')), 'plain');
});

test('saving: unchanged closes, a text message cannot be emptied', () => {
  const m = text('hi');
  assert.equal(editOutcome({ message: m, text: 'hi', before: 'hi' }), 'close');
  assert.equal(editOutcome({ message: m, text: '  ', before: 'hi' }), 'ignore');
  assert.equal(editOutcome({ message: m, text: 'ho', before: 'hi' }), 'save');
});

test('a message with media may have its caption emptied', () => {
  const m = photo('a caption');
  assert.equal(hasMedia(m), true);
  assert.equal(
    editOutcome({ message: m, text: '', before: 'a caption' }),
    'save'
  );
  assert.deepEqual(
    editBody({ message: m, text: '', preview: { noWebpage: true } }),
    { ids: [m.id], text: '', caption: true }
  );
});

test('a link preview is no media', () => {
  const m = text('see x.test', {
    raw: {
      id: 5,
      media: {
        className: 'MessageMediaWebPage',
        webpage: { url: 'http://x.test' },
      },
    },
  });
  assert.equal(hasMedia(m), false);
});

test('the edit carries the link preview choice for text only', () => {
  const m = text('see x.test');
  assert.deepEqual(
    editBody({
      message: m,
      text: 'see x.test now',
      preview: { noWebpage: true, invertMedia: true },
    }),
    { ids: [m.id], text: 'see x.test now', noWebpage: true, invertMedia: true }
  );
  assert.deepEqual(editBody({ message: m, text: 'a' }), {
    ids: [m.id],
    text: 'a',
  });
});

test('Up edits the newest own message that is not too old', () => {
  const now = Date.parse('2026-01-10T12:00:00Z');
  const old = text('old', { id: 'a', timestamp: '2026-01-01T00:00:00Z' });
  const fresh = text('fresh', { id: 'b', timestamp: '2026-01-10T11:00:00Z' });
  assert.equal(canEdit(old, now), false);
  assert.equal(lastEditable([fresh, old], now).id, 'b');
  assert.equal(lastEditable([old], now), null);
});
