// Issue #31 / PR #34: the Automations screen — every outreach is an
// automation the user edits (triggers, audience, conditions, ты/вы
// texts, safe/auto, pacing), previews (who and why not), runs on its
// audience or on people picked in a search, with saved audiences.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import { automationPresets } from '../src/automation/automations.js';
import {
  blankAutomation,
  checkForm,
  exclusionSummary,
  fromForm,
  selectionAudience,
  targetsFor,
  toForm,
} from '../src/web/automations-model.js';
import { AutomationsScreen } from '../src/web/automations-view.js';

const preset = (id) =>
  automationPresets().find((a) => a.id === `automation:${id}`);

test('form: every preset survives the editor unchanged', () => {
  for (const automation of automationPresets()) {
    const { automation: back } = checkForm(toForm(automation), automation);
    assert.deepEqual(back, automation, automation.id);
  }
});

test('form: issue #31 as fields, and edits land in the automation', () => {
  const dormant = preset('reengage-dormant');
  const form = toForm(dormant);
  assert.equal(form.silentDays, '90');
  assert.equal(form.mutual, true);
  assert.equal(form.manual, true);
  assert.equal(form.chatMenu, true);
  assert.equal(form.form, 'auto');
  assert.match(form.informal, /^Привет/);
  assert.match(form.formal, /^Здравствуйте/);
  assert.equal(form.minDelay, '20');

  const edited = fromForm(
    {
      ...form,
      audience: 'friends:vk & chat:vk:2000000001 - list:blocked',
      schedule: '1d',
      networks: 'vk, telegram',
      silentDays: '30',
      minDelay: '5',
      formal: '',
    },
    dormant
  );
  assert.equal(edited.audience.kind, 'difference');
  assert.deepEqual(edited.triggers.at(-1), { kind: 'schedule', every: '1d' });
  assert.deepEqual(edited.conditions.networks, ['vk', 'telegram']);
  assert.equal(edited.conditions.silentDays, 30);
  assert.equal(edited.pacing.minDelayMs, 5000);
  // Fields the form does not show are kept.
  assert.equal(edited.pacing.charsPerMinute, dormant.pacing.charsPerMinute);
  assert.equal(edited.action.templates.formal, undefined);
  assert.equal(edited.preset, dormant.preset);
});

test('form: refuses what would not run, saying where', () => {
  const form = toForm(blankAutomation('Hi'));
  assert.equal(checkForm({ ...form, name: ' ' }).field, 'name');
  assert.equal(checkForm({ ...form, silentDays: '-1' }).field, 'silentDays');
  assert.equal(checkForm({ ...form, limit: 'many' }).field, 'limit');
  const audience = checkForm({ ...form, audience: 'friends:vk & (' });
  assert.equal(audience.error, 'automations.error.audience');
  assert.ok(audience.detail);
  assert.equal(
    checkForm({ ...form, manual: false, chatMenu: false }).error,
    'automations.error.trigger'
  );
  assert.equal(
    checkForm({ ...form, schedule: 'often' }).error,
    'automations.error.invalid'
  );
  assert.match(checkForm({ ...form, schedule: 'often' }).detail, /duration/);
  assert.ok(checkForm(form).automation);
});

test('selection: targets prefer the 1:1 chat; an audience of people', () => {
  const people = [
    { key: 'vk:1', source: 'vk', user: '1', personalChat: '1' },
    { key: 'telegram:2', source: 'telegram', user: '2' },
  ];
  assert.deepEqual(targetsFor(people), [
    { source: 'vk', chat: '1' },
    { source: 'telegram', chat: '2' },
  ]);
  assert.equal(selectionAudience(people), '(person:vk:1 | person:telegram:2)');
  assert.equal(selectionAudience([]), '');
  assert.deepEqual(
    exclusionSummary([
      { reason: 'talked-recently' },
      { reason: 'not-mutual' },
      { reason: 'talked-recently' },
    ]),
    [
      { reason: 'talked-recently', count: 2 },
      { reason: 'not-mutual', count: 1 },
    ]
  );
});

const noop = () => {};
const fakeState = (overrides = {}) => {
  const dormant = { ...preset('reengage-dormant'), saved: true };
  return {
    editor: {
      loading: false,
      list: [dormant, { ...preset('greet-back'), saved: false }],
      current: dormant,
      form: toForm(dormant),
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
      plan: {
        total: 1,
        drafts: [
          {
            id: 'd1',
            name: 'Alice',
            source: 'vk',
            chat: '101',
            form: 'informal',
            text: 'Привет! Тебе или твоим друзьям…',
          },
        ],
        excluded: [{ reason: 'talked-recently' }],
      },
      history: [
        {
          id: 'r1',
          status: 'sent',
          source: 'vk',
          chat: '102',
          at: '2026-10-01T00:00:00Z',
          text: 'Здравствуйте!',
        },
      ],
      preview: noop,
      run: noop,
      clearPlan: noop,
      ...overrides.runs,
    },
    people: {
      query: 'ali',
      setQuery: noop,
      results: [
        {
          key: 'vk:alice',
          name: 'Alice',
          handle: 'alice',
          sameAs: ['telegram:alice'],
        },
      ],
      selected: [{ key: 'vk:alice' }],
      isSelected: () => true,
      toggle: noop,
      clear: noop,
      spec: 'person:vk:alice',
      saveList: noop,
      ...overrides.people,
    },
    audiences: {
      saved: [
        { id: 'audience:vip', name: 'VIP', text: 'friends:vk & list:vip' },
      ],
      name: '',
      setName: noop,
      spec: 'friends:vk',
      setSpec: noop,
      count: { count: 2, people: [{ name: 'Alice' }, { key: 'vk:bob' }] },
      resolve: noop,
      save: noop,
      remove: noop,
      ...overrides.audiences,
    },
    notice: overrides.notice ?? { kind: 'queued', count: 2 },
    dismiss: noop,
    applyAudience: noop,
  };
};

const render = (state, locale = 'en') =>
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

test('screen: list, editor, preview, history, people and audiences', () => {
  const html = render(fakeState());
  assert.match(html, /<h2>Automations<\/h2>/);
  // Saved and preset automations, with mode and triggers in words.
  assert.match(html, /data-automation="automation:reengage-dormant"/);
  assert.match(html, /by hand · from a chat&#x27;s menu/);
  assert.match(html, /on an incoming message matching · from a chat/);
  assert.match(html, /preset · off/);
  // The editor shows issue #31's automation as editable fields.
  assert.match(html, /name="silentDays" value="90"/);
  assert.match(html, /<option value="auto" selected="">detect ты\/вы/);
  assert.match(html, /name="informal"[^>]*>Привет/);
  assert.match(html, /save and queue drafts/);
  assert.match(html, /class="danger">delete</);
  // Preview, why the rest are left out, and the history.
  assert.match(html, /1 to message/);
  assert.match(html, /Left out: talked recently × 1/);
  assert.match(html, /Привет! Тебе или твоим друзьям/);
  assert.match(html, /status sent">sent</);
  // People search with selection, run on them, save as a list.
  assert.match(html, /also on 1 more network/);
  assert.match(html, /1 selected/);
  assert.match(html, /run &quot;Say hi/);
  assert.match(html, /the 1 selected/);
  // Saved audiences and a resolved count.
  assert.match(html, /<strong>VIP<\/strong>/);
  assert.match(html, /2 people: Alice, vk:bob/);
  assert.match(html, /2 drafts wait in their chats/);
});

test('screen: auto mode says it sends; errors and empty editor', () => {
  const state = fakeState({
    editor: {
      form: { ...toForm(preset('reengage-dormant')), mode: 'auto' },
      current: preset('reengage-dormant'),
      error: {
        error: 'automations.error.audience',
        field: 'audience',
        detail: 'bad',
      },
    },
    runs: { plan: null, history: [] },
    audiences: { count: { error: 'unknown kind' } },
    notice: { kind: 'failed', error: 'captcha' },
  });
  const html = render(state);
  assert.match(html, /save and send now/);
  // Not saved yet, so nothing to delete.
  assert.doesNotMatch(html, /class="danger"/);
  assert.match(html, /role="alert">The audience does not parse: bad/);
  assert.match(html, /aria-invalid="true" name="audience"/);
  assert.match(html, /Not sent: captcha/);
  assert.match(html, /role="alert">unknown kind/);

  const closed = render(
    fakeState({
      editor: { form: null, current: null },
      people: { selected: [] },
    })
  );
  assert.match(closed, /Pick an automation/);
  assert.doesNotMatch(closed, /automation-editor/);
});

test('screen: translated', () => {
  const html = render(fakeState(), 'ru');
  assert.match(html, /<h2>Автоматизации<\/h2>/);
  assert.match(html, /Не общались не меньше \(дней\)/);
  assert.match(html, /Не вошли: недавно общались × 1/);
});
