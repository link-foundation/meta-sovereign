import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeChats } from '../src/web/chat-model.js';
import { chatDisplayName, TelegramUserId } from '../src/web/chat-identity.js';
import { ProfileHead } from '../src/web/chat-shared.js';
import { ChatAvatar } from '../src/web/chat-list.js';
import { translate } from '../src/web/i18n.js';

const t = (key, vars) => translate('en', key, vars);
const base = {
  key: 'telegram:555',
  source: 'telegram',
  chat: '555',
  name: '555',
  personal: true,
  kind: 'private',
};

test('deleted identity survives summaries of stored messages and cleared chats', () => {
  const links = [
    {
      id: 'msg:telegram:555:1',
      source: 'telegram',
      chat: '555',
      sender: 'me',
      body: 'Hello',
      timestamp: '2025-01-01T00:00:00Z',
      deletedAccount: true,
    },
  ];
  assert.equal(summarizeChats(links)[0].deletedAccount, true);
  const [cleared] = summarizeChats([
    {
      id: 'read:telegram:555',
      source: 'telegram',
      chat: '555',
      clearedAt: '2025-01-01T00:00:00Z',
      deletedAccount: true,
    },
  ]);
  assert.equal(cleared.deletedAccount, true);
});

test('IDs, missing names and deleted flags have different presentations', () => {
  assert.equal(chatDisplayName(base, t), 'Telegram user');
  assert.equal(chatDisplayName({ ...base, name: 'Alice' }, t), 'Alice');
  assert.equal(
    chatDisplayName({ ...base, deletedAccount: true }, t),
    'Deleted account'
  );
  assert.equal(
    chatDisplayName(base, t, { deletedAccount: true }),
    'Deleted account'
  );
  assert.equal(chatDisplayName(base, t, { title: 'Alice' }), 'Alice');
  assert.equal(
    chatDisplayName({ ...base, name: '+1234567890' }, t),
    '+1234567890'
  );
});

test('deleted profiles use a clear identity icon and a separately labeled copyable user ID', () => {
  const chat = { ...base, deletedAccount: true };
  const avatar = renderToStaticMarkup(
    React.createElement(ChatAvatar, { chat })
  );
  assert.match(avatar, /deleted-account-avatar/);
  assert.doesNotMatch(avatar, /<img/);
  const profile = renderToStaticMarkup(
    React.createElement(ProfileHead, { chat, info: { kind: 'user' } })
  );
  assert.match(profile, /Deleted account/);
  assert.doesNotMatch(profile, /last seen/);
  assert.match(profile, /Telegram user ID/);
  assert.match(profile, /<code>555<\/code>/);
  assert.match(profile, /aria-label="Copy Telegram user ID"/);
  assert.equal(
    renderToStaticMarkup(
      React.createElement(TelegramUserId, {
        chat: { ...base, chat: '-100555', personal: false },
      })
    ),
    ''
  );
});
