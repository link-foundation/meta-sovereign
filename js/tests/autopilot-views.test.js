// Autopilot controls on the Automations page and in the Automation menu
// of the chat screen (R-Y87): pure helpers and rendered output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import { shownAutopilot } from '../src/web/autopilot-hook.js';
import { automationPresets } from '../src/automation/automations.js';
import { toForm } from '../src/web/automations-model.js';
import { AutomationsScreen } from '../src/web/automations-view.js';
import { ChatScreen } from '../src/web/chat-view.js';
import { chatMessages, summarizeChats } from '../src/web/chat-model.js';

// ---------------------------------------------------------------------------
// Pure helper: shownAutopilot
// ---------------------------------------------------------------------------

test('shownAutopilot: prefers an on state; hides dismissed and stopped', () => {
  const on = { id: 'ap:a', automation: 'a', on: true, updatedAt: '2' };
  const done = {
    id: 'ap:b',
    automation: 'b',
    on: false,
    status: 'done',
    updatedAt: '3',
  };
  assert.equal(shownAutopilot([on, done]), on, 'running beats finished');
  assert.equal(shownAutopilot([done]), done, 'finished shows until dismissed');
  assert.equal(shownAutopilot([done], '3'), null, 'dismissed by updatedAt');
  assert.equal(
    shownAutopilot([{ ...done, status: 'stopped' }]),
    null,
    'stopped by the user: nothing to show'
  );
});

// ---------------------------------------------------------------------------
// Helpers shared by view tests
// ---------------------------------------------------------------------------

const noop = () => {};
const preset = (id) =>
  automationPresets().find((a) => a.id === `automation:${id}`);

const fakeAutopilot = (overrides = {}) => ({
  states: [],
  shown: null,
  stateFor: () => null,
  start: noop,
  stop: noop,
  monitor: noop,
  dismiss: noop,
  dismissOne: noop,
  ...overrides,
});

const dormant = () => ({ ...preset('reengage-dormant'), saved: true });
const greetBack = () => ({ ...preset('greet-back'), saved: false });

const fakeState = (overrides = {}) => ({
  editor: {
    loading: false,
    list: [dormant(), greetBack()],
    current: dormant(),
    form: toForm(dormant()),
    error: null,
    open: noop,
    create: noop,
    close: noop,
    setField: noop,
    save: noop,
    remove: noop,
    ...overrides.editor,
  },
  runs: {
    busy: false,
    plan: null,
    history: [],
    preview: noop,
    run: noop,
    clearPlan: noop,
    ...overrides.runs,
  },
  people: {
    query: '',
    setQuery: noop,
    results: [],
    selected: [],
    isSelected: () => false,
    toggle: noop,
    clear: noop,
    spec: '',
    saveList: noop,
    ...overrides.people,
  },
  audiences: {
    saved: [],
    name: '',
    setName: noop,
    spec: '',
    setSpec: noop,
    count: null,
    resolve: noop,
    save: noop,
    remove: noop,
    ...overrides.audiences,
  },
  autopilot: overrides.autopilot ?? fakeAutopilot(),
  notice: null,
  dismiss: noop,
  applyAudience: noop,
});

const renderScreen = (state, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: noop,
          t: (k, v) => translate(locale, k, v),
        },
      },
      React.createElement(AutomationsScreen, { state })
    )
  );

// ---------------------------------------------------------------------------
// Automations page: autopilot row controls
// ---------------------------------------------------------------------------

test('screen: shows Autopilot button for each valid automation when off', () => {
  const html = renderScreen(fakeState());
  // Two valid automations — each should show a start button.
  const matches = [...html.matchAll(/data-action="autopilot-start"/g)];
  assert.equal(
    matches.length,
    2,
    'one Autopilot start button per valid automation'
  );
  assert.match(html, /Autopilot/);
});

test('screen: shows running bar when autopilot is on for an automation', () => {
  const automationId = 'automation:reengage-dormant';
  const apState = {
    id: `automation-autopilot:${automationId}`,
    automation: automationId,
    automationName: 'Say hi',
    on: true,
    monitor: false,
    status: 'sending',
    current: { source: 'vk', chat: '101', name: 'Alice' },
    sent: 3,
    failed: 0,
    nextAt: null,
    error: null,
    updatedAt: '2026-10-21T00:00:00Z',
  };
  const autopilot = fakeAutopilot({
    stateFor: (id) => (id === automationId ? apState : null),
  });
  const html = renderScreen(fakeState({ autopilot }));
  // Running automation shows Stop and Monitor, not the start button.
  assert.match(html, /data-action="autopilot-stop"/);
  assert.match(html, /autopilot-monitor/);
  assert.doesNotMatch(
    html,
    /data-action="autopilot-start"[^>]*data-automation="automation:reengage-dormant"/
  );
  // Status text says who it is writing to.
  assert.match(html, /Alice/);
});

test('screen: shows done status with dismiss when autopilot finished', () => {
  const automationId = 'automation:reengage-dormant';
  const apState = {
    id: `automation-autopilot:${automationId}`,
    automation: automationId,
    on: false,
    monitor: false,
    status: 'done',
    current: null,
    sent: 5,
    failed: 0,
    nextAt: null,
    error: null,
    updatedAt: '2026-10-21T00:01:00Z',
  };
  const autopilot = fakeAutopilot({
    stateFor: (id) => (id === automationId ? apState : null),
  });
  const html = renderScreen(fakeState({ autopilot }));
  // Done state shows Dismiss instead of Stop.
  assert.match(html, /data-action="autopilot-close"/);
  assert.doesNotMatch(html, /data-action="autopilot-stop"/);
});

test('screen: invalid automation has no autopilot controls', () => {
  const state = fakeState({
    editor: {
      list: [dormant(), { ...greetBack(), invalid: 'broken: cannot run' }],
    },
  });
  const html = renderScreen(state);
  // Only the valid dormant automation gets a button.
  const matches = [...html.matchAll(/data-action="autopilot-start"/g)];
  assert.equal(matches.length, 1);
});

// ---------------------------------------------------------------------------
// Chat screen: Autopilot item in AutomationMenu
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-10-11T12:00:00Z');
const at = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
let seq = 0;
const msg = (chat, sender, body, hoursAgo) => ({
  id: `msg:vk:${(seq += 1)}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: at(hoursAgo),
});

const chatLinks = [
  msg('101', 'me', 'Hey', 2),
  msg('101', 'alice', 'Hi', 1, { senderName: 'Alice' }),
];

const renderChat = (state, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: noop,
          t: (k, v) => translate(locale, k, v),
        },
      },
      React.createElement(ChatScreen, { state })
    )
  );

const chatState = (overrides = {}) => {
  const chats = summarizeChats(chatLinks);
  const current = chats[0];
  return {
    loading: false,
    chats,
    total: chats.length,
    query: '',
    setQuery: noop,
    current,
    select: noop,
    messages: chatMessages(chatLinks, current.key),
    typing: { people: [], automation: null },
    composer: { text: '', setText: noop, send: noop },
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
    drafts: { drafts: [], act: noop, edit: noop },
    notice: null,
    dismiss: noop,
    refresh: noop,
    ...overrides,
  };
};

test('menu: shows Autopilot start button for each automation', () => {
  const html = renderChat(chatState({ autopilot: fakeAutopilot() }));
  assert.match(html, /data-action="autopilot-start"/);
  assert.match(html, /Autopilot/);
  // Existing Test and Run buttons are still present.
  assert.match(html, /data-action="chat-automation-test"/);
  assert.match(html, /data-action="chat-automation-run"/);
});

test('menu: shows Stop when autopilot is on for that automation', () => {
  const automationId = 'automation:reengage-dormant';
  const apState = {
    id: `automation-autopilot:${automationId}`,
    automation: automationId,
    on: true,
    monitor: false,
    status: 'sending',
  };
  const autopilot = fakeAutopilot({
    stateFor: (id) => (id === automationId ? apState : null),
  });
  const html = renderChat(chatState({ autopilot }));
  assert.match(html, /data-action="autopilot-stop"/);
  assert.doesNotMatch(html, /data-action="autopilot-start"/);
});

test('menu: renders gracefully without autopilot (legacy state shape)', () => {
  // state.autopilot may be absent in older snapshots or tests.
  const html = renderChat(chatState({ autopilot: undefined }));
  // Should still render the standard Run/Test buttons.
  assert.match(html, /data-action="chat-automation-test"/);
  // Falls back to showing the Autopilot start button (autopilot?.start is a no-op).
  assert.match(html, /data-action="autopilot-start"/);
});
