import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChats } from '../src/sources/browser-actions.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';

const cell = ({
  id,
  link,
  title = 'Employer',
  preview = 'Question?',
  unread,
} = {}) => ({
  getAttribute: () => id ?? null,
  matches: () => false,
  querySelector(selector) {
    const spec = HH_WEB_UI.chats;
    if (selector === spec.link) {
      return link ? { getAttribute: () => link } : null;
    }
    if (selector === spec.title) {
      return { textContent: title };
    }
    if (selector === spec.preview) {
      return { textContent: preview };
    }
    if (selector === spec.unread && unread !== undefined) {
      return { textContent: String(unread) };
    }
    return null;
  },
});
const read = (rows, limit = 50) => {
  const previous = globalThis.document;
  globalThis.document = { querySelectorAll: () => rows };
  try {
    return extractChats({ ...HH_WEB_UI.chats, limit });
  } finally {
    globalThis.document = previous;
  }
};

test('HH native virtual cells expose numeric web identities, previews and actual unread badges', () => {
  const rows = read([
    cell({ id: 'chatik-open-chat-7', unread: 3 }),
    cell({ id: 'chatik-open-chat-8', unread: '' }),
    cell({ id: 'chatik-open-chat-9' }),
  ]);
  assert.deepEqual(
    rows.map(({ chat, preview, unread }) => [chat, preview, unread]),
    [
      ['7', 'Question?', 3],
      ['8', 'Question?', 1],
      ['9', 'Question?', 0],
    ]
  );
});

test('HH rejects malformed, title-only and conflicting identities before applying the unique-chat limit', () => {
  const rows = read(
    [
      cell({ title: 'Cannot navigate this title' }),
      cell({ id: 'chatik-open-chat-7garbage', link: '/chat/7' }),
      cell({ id: 'chatik-open-chat-7', link: '/chat/8' }),
      cell({ id: 'chatik-open-chat-7', link: '/chat/7', unread: 4 }),
      cell({ link: '/chat/7', title: 'Nested duplicate anchor' }),
      cell({ link: '/chat/8', title: 'Older anchor layout' }),
    ],
    2
  );
  assert.deepEqual(
    rows.map(({ chat, title, unread }) => [chat, title, unread]),
    [
      ['7', 'Employer', 4],
      ['8', 'Older anchor layout', 0],
    ]
  );
});
