// Issue #31 / PR #34: the t3-style chat screen — conversation list with
// search and date sections, typing status both ways, the automation menu
// inside each chat, drafts settled in place and the two-stage composer
// suggestions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import {
  avatarFor,
  chatMenuAutomations,
  chatMessages,
  dayGroup,
  groupChats,
  senderNames,
  summarizeChats,
  typingStatus,
} from '../src/web/chat-model.js';
import { ChatScreen, reasonText } from '../src/web/chat-view.js';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const at = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
let seq = 0;
const msg = (chat, sender, body, hoursAgo, extra = {}) => ({
  id: `msg:vk:${(seq += 1)}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: at(hoursAgo),
  ...extra,
});

const links = [
  msg('101', 'me', 'Привет! Как ты?', 30, {}),
  msg('101', 'alice', 'Норм', 29, { senderName: 'Alice Smith' }),
  msg('2000000001', 'bob', 'Всем привет', 2, { chatName: 'Team' }),
  msg('2000000001', 'carol', 'Hi', 1, { senderName: 'Carol' }),
  msg('2000000001', 'me', 'Hello', 0.5),
  msg('303', 'dave', 'Long ago', 24 * 40),
  { id: 'typing:vk:101:alice', kind: 'typing' },
];

test('chats: one row per conversation, newest first, searchable', () => {
  const chats = summarizeChats(links);
  assert.deepEqual(
    chats.map((c) => [c.chat, c.name, c.personal]),
    [
      ['2000000001', 'Team', false],
      ['101', 'Alice Smith', true],
      ['303', 'dave', true],
    ]
  );
  const { message: lastMessage, ...last } = chats[0].last;
  assert.deepEqual(last, {
    body: 'Hello',
    mine: true,
    at: at(0.5),
    senderName: null,
  });
  assert.equal(lastMessage.body, 'Hello', 'the message itself, for media');
  assert.deepEqual(
    [chats[0].muted, chats[0].pinned, chats[0].archived],
    [false, 0, false]
  );
  assert.deepEqual(chats[0].people.sort(), ['bob', 'carol']);
  // Any message, the name or the network matches; every word must.
  assert.deepEqual(
    summarizeChats(links, { query: 'норм alice' }).map((c) => c.chat),
    ['101']
  );
  assert.equal(summarizeChats(links, { query: 'nobody' }).length, 0);
  assert.deepEqual(
    chatMessages(links, 'vk:101').map((m) => m.body),
    ['Привет! Как ты?', 'Норм']
  );
});

test('chats: every adapter chat type the CRM calls personal is personal', () => {
  // Telegram exports say `personal_chat`, the Bot API `private`, VK
  // `user`; anything else (`private_group`, `channel`) is a group.
  const typed = (chat, chatType) => [
    msg(chat, 'me', 'Привет', 2, { chatType }),
    msg(chat, `u${chat}`, 'Привет!', 1, { chatType }),
  ];
  const chats = summarizeChats([
    ...typed('1', 'personal_chat'),
    ...typed('2', 'private'),
    ...typed('3', 'user'),
    ...typed('4', 'private_group'),
    ...typed('5', 'channel'),
  ]);
  assert.deepEqual(chats.map((c) => [c.chat, c.personal]).sort(), [
    ['1', true],
    ['2', true],
    ['3', true],
    ['4', false],
    ['5', false],
  ]);
});

test('chats: t3-style date sections', () => {
  const local = new Date(NOW);
  local.setHours(0, 0, 0, 0);
  const midnight = local.getTime();
  assert.equal(dayGroup(new Date(midnight + 1000).toISOString(), NOW), 'today');
  assert.equal(
    dayGroup(new Date(midnight - 1000).toISOString(), NOW),
    'yesterday'
  );
  assert.equal(
    dayGroup(new Date(midnight - 3 * 86_400_000).toISOString(), NOW),
    'week'
  );
  assert.equal(dayGroup(at(24 * 40), NOW), 'older');
  assert.equal(dayGroup('not a date', NOW), 'older');
  const groups = groupChats(summarizeChats(links), NOW);
  assert.equal(groups.at(-1).group, 'older');
  assert.deepEqual(
    groups.at(-1).chats.map((c) => c.chat),
    ['303']
  );
});

test('typing: other people by name, an automation on our behalf', () => {
  const names = senderNames(chatMessages(links, 'vk:101'));
  assert.deepEqual(
    typingStatus([{ user: 'alice' }, { user: 'me' }], { names }),
    { people: ['Alice Smith'], automation: null }
  );
  assert.deepEqual(
    typingStatus([
      {
        user: 'me',
        automation: 'automation:reengage-dormant',
        automationName: 'Say hi',
      },
    ]),
    { people: [], automation: 'Say hi' }
  );
});

test('menu: only automations with a chat-menu trigger; avatars are stable', () => {
  const offered = chatMenuAutomations([
    { id: 'a', triggers: [{ kind: 'manual' }] },
    { id: 'b', triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }] },
    { id: 'c', invalid: 'broken', triggers: [{ kind: 'chat-menu' }] },
  ]);
  assert.deepEqual(
    offered.map((a) => a.id),
    ['b']
  );
  assert.deepEqual(avatarFor('Alice Smith'), avatarFor('Alice Smith'));
  assert.equal(avatarFor('Alice Smith').initials, 'AS');
  assert.equal(avatarFor('  ').initials, '?');
});

const render = (state, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: () => {},
          t: (key, vars) => translate(locale, key, vars),
        },
      },
      React.createElement(ChatScreen, { state })
    )
  );

const noop = () => {};
const screenState = (overrides = {}) => {
  const chats = summarizeChats(links);
  const current = chats.find((c) => c.chat === '101');
  return {
    loading: false,
    chats,
    total: chats.length,
    query: '',
    setQuery: noop,
    current,
    select: noop,
    messages: chatMessages(links, current.key),
    typing: { people: [], automation: null },
    composer: { text: 'При', setText: noop, send: noop },
    suggest: {
      stage: 'reply',
      suggestions: [
        { text: 'Привет! Как дела?', count: 3 },
        { text: 'Привет', count: 1 },
      ],
    },
    menu: {
      open: true,
      toggle: noop,
      run: noop,
      automations: [
        {
          id: 'automation:reengage-dormant',
          name: 'Say hi',
          mode: 'safe',
          triggers: [{ kind: 'chat-menu' }],
        },
      ],
    },
    drafts: {
      drafts: [
        {
          id: 'automation-draft:reengage-dormant:vk:101',
          automation: 'automation:reengage-dormant',
          automationName: 'Say hi',
          form: 'informal',
          text: 'Привет\nТебе удобно сейчас пообщаться?',
          prefill: { url: 'https://vk.com/im?sel=101', prefillsText: false },
        },
      ],
      act: noop,
      edit: noop,
    },
    notice: { kind: 'queued', count: 1 },
    dismiss: noop,
    refresh: noop,
    ...overrides,
  };
};

test('screen: sidebar, header, menu, draft, composer chips', () => {
  const html = render(screenState());
  assert.match(html, /class="chat-shell"/);
  // Telegram's order has no date sections (oldest first keeps them).
  assert.doesNotMatch(html, /<h3>/);
  assert.match(html, /data-chat="vk:101" aria-current="true"/);
  // Networks by their names, not their ids.
  assert.match(html, /VK · personal chat/);
  assert.match(html, /class="chat-item-source">VK</);
  assert.match(html, /data-action="chat-automation-test"/);
  assert.match(html, /Test in this chat/);
  assert.match(html, /class="meta">Safe: drafts to confirm</);
  assert.match(html, /Draft from Say hi · informal/);
  assert.match(html, /data-action="draft-send"/);
  assert.match(html, /Switch to formal/);
  assert.match(html, /href="https:\/\/vk.com\/im\?sel=101"/);
  assert.match(html, /1 draft is ready below/);
  assert.match(html, /data-stage="reply"/);
  assert.match(html, /title="Used 3 times"/);
  assert.match(html, /class="bubble out[ "]/);
  assert.match(html, /class="bubble in[ "]/);
});

test('screen: phones show one pane at a time, with a way back', () => {
  const html = render(screenState());
  // The list shows first; picking a chat switches the pane, and the
  // header's back button (hidden by CSS on wider screens) returns.
  assert.match(html, /class="chat-shell" data-pane="list"/);
  assert.match(
    html,
    /<button[^>]*class="chat-back icon-btn"[^>]*data-action="chat-back"[^>]*aria-label="Back to chats"/
  );
  // Icons are decorative; every icon-only control has a name.
  assert.match(html, /<svg class="icon icon-back"[^>]*aria-hidden="true"/);
  assert.match(html, /data-action="chat-automations"[^>]*>.*Automations/);
});

test('screen: typing status, translated, and the empty states', () => {
  const typing = render(
    screenState({ typing: { people: [], automation: 'Say hi' } }),
    'ru'
  );
  assert.match(typing, /Say hi печатает за вас…/);
  // A preset's stored English name is shown in the user's language.
  const preset = render(
    screenState({
      typing: {
        people: [],
        automation: 'Say hi to contacts silent for 90 days',
      },
    }),
    'ru'
  );
  assert.match(preset, /Привет тем, кто молчит 90 дней печатает за вас…/);
  const people = render(
    screenState({ typing: { people: ['Alice Smith'], automation: null } })
  );
  assert.match(people, /data-typing="people">Alice Smith typing…/);
  assert.match(render(screenState({ loading: true })), /Loading/);
  // No chats at all: the connection guide explains how to import some.
  assert.doesNotMatch(
    render(screenState({ total: 0, chats: [] })),
    /chat-shell/
  );
  const none = render(
    screenState({ menu: { ...screenState().menu, automations: [] } })
  );
  assert.match(none, /chat menu/);
});

test('notice: exclusion reasons in words, unknown ones as they are', () => {
  const t = (key, vars) => translate('en', key, vars);
  assert.equal(reasonText(t, 'talked-recently'), 'talked recently');
  assert.equal(reasonText(t, null), 'no one matched');
  assert.equal(reasonText(t, 'something-new'), 'something-new');
  const html = render(
    screenState({ notice: { kind: 'nothing', reason: 'draft-pending' } })
  );
  assert.match(html, /Nothing to send here: a draft is already waiting\./);
});

test('screen: a connected Telegram account never asks to connect again', () => {
  const telegram = (extra) => ({
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
    syncNow: noop,
    ...extra,
  });
  const syncing = render(
    screenState({ total: 0, chats: [], telegram: telegram({ syncing: true }) })
  );
  assert.match(syncing, /Connected as @owner/);
  assert.match(syncing, /Loading your chats and contacts/);
  assert.match(syncing, /data-state="syncing"/);
  const failed = render(
    screenState({
      total: 0,
      chats: [],
      telegram: telegram({ error: 'AUTH_KEY_UNREGISTERED' }),
    })
  );
  assert.match(failed, /Telegram did not sync: AUTH_KEY_UNREGISTERED/);
  assert.match(failed, /Open Telegram connection/);
  // With chats, the list carries the account and "Sync now".
  const list = render(screenState({ telegram: telegram({}) }));
  assert.match(list, /class="chat-account-line"/);
  assert.match(list, /Sync now/);
});

test('chats: a contact opened from Contacts gets a chat before any message', async () => {
  const { chatFromHash, emptyChat } = await import('../src/web/chat-state.js');
  assert.deepEqual(chatFromHash('#chat=telegram:42'), {
    source: 'telegram',
    chat: '42',
  });
  assert.deepEqual(chatFromHash('#chat=telegram:-100%3A1'), {
    source: 'telegram',
    chat: '-100:1',
  });
  assert.equal(chatFromHash('#conn-telegram'), null);
  const chat = emptyChat(
    [{ id: 'person:telegram:42', name: 'Alice Liddell', handle: 'alice' }],
    { source: 'telegram', chat: '42' }
  );
  assert.equal(chat.key, 'telegram:42');
  assert.equal(chat.name, 'Alice Liddell');
  assert.equal(chat.personal, true);
  assert.equal(emptyChat([], { source: 'telegram', chat: '7' }).name, '7');
});

test('chats: a chat started from Contacts is named after the person', () => {
  const [chat] = summarizeChats([
    {
      id: 'msg:telegram:77:101',
      source: 'telegram',
      chat: '77',
      sender: 'me',
      body: 'Hello Bob',
      chatType: 'personal_chat',
      timestamp: at(0),
    },
    { id: 'person:telegram:77', source: 'telegram', user: '77', name: 'Bob' },
  ]);
  assert.equal(chat.name, 'Bob');
  assert.equal(chat.personal, true);
});
