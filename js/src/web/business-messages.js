// The greeting message and the away message of Telegram Business, as
// Telegram Desktop's Settings → Telegram Business has them (R-Y179; learned,
// never copied). Each is a switch, the quick reply shortcut it sends
// ("hello" / "away"), the recipients (every 1-on-1 chat, or by kind, with
// chosen people included or excluded) and, for the greeting, how many days
// of silence before it is sent again; for the away message when it is sent
// (always, outside business hours, or between two dates) and whether only
// while offline. Nothing is written before Save; Telegram's refusals
// (Premium needed…) show in words.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { useChatChoices } from './chat-folder-edit.js';
import { QuickRepliesDialog } from './quick-replies.js';
import {
  CATEGORIES,
  DAYS,
  SPECIAL,
  errorText,
  forgetQuickReplies,
  formOf,
  requestOf,
  withCategory,
  withPerson,
} from './quick-replies-model.js';

const el = React.createElement;

const SAVE = {
  greeting: 'telegramBusinessGreetingSave',
  away: 'telegramBusinessAwaySave',
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const Check = ({ name, label, on, onChange }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-field': name,
      checked: on,
      onChange: (e) => onChange(e.target.checked),
    }),
    ` ${label}`,
  ]);

const ShortcutPick = ({ t, kind, shortcuts, value, set, onEdit }) =>
  el('div', { className: 'business-shortcut' }, [
    el('label', { key: 'l', className: 'chat-form-field' }, [
      el('span', { key: 't', className: 'meta' }, t('business.shortcut')),
      el(
        'select',
        {
          key: 's',
          'data-field': 'shortcut',
          value,
          onChange: (e) => set(e.target.value),
        },
        [
          el('option', { key: '', value: '' }, t('business.chooseShortcut')),
          ...shortcuts.map((s) =>
            el('option', { key: s.id, value: String(s.id) }, `/${s.name}`)
          ),
        ]
      ),
    ]),
    el(
      'button',
      {
        key: 'e',
        type: 'button',
        'data-action': 'business-edit-replies',
        onClick: onEdit,
      },
      t('business.editReplies', { name: SPECIAL[kind] })
    ),
  ]);

const People = ({ t, form, setForm, people, chats }) => {
  const [open, setOpen] = useState(false);
  const names = new Map([...people, ...chats.map((c) => [c.id, c.name])]);
  const persons = chats.filter((c) => !c.chat.startsWith('-'));
  const r = form.recipients;
  return el('fieldset', { className: 'business-recipients' }, [
    el('legend', { key: 'g' }, t('business.recipients')),
    ...CATEGORIES.map((key) =>
      el(Check, {
        key,
        name: key,
        label: t(`business.cat.${key}`),
        on: r[key],
        onChange: (on) =>
          setForm({ ...form, recipients: withCategory(r, key, on) }),
      })
    ),
    el('label', { key: 'm', className: 'chat-form-field' }, [
      el('span', { key: 't', className: 'meta' }, t('business.selected')),
      el(
        'select',
        {
          key: 's',
          'data-field': 'exclude',
          value: r.excludeSelected ? 'exclude' : 'include',
          onChange: (e) =>
            setForm({
              ...form,
              recipients: {
                ...r,
                excludeSelected: e.target.value === 'exclude',
              },
            }),
        },
        [
          el('option', { key: 'x', value: 'exclude' }, t('business.exclude')),
          el('option', { key: 'i', value: 'include' }, t('business.include')),
        ]
      ),
    ]),
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        'data-action': 'business-choose-people',
        'aria-expanded': open,
        onClick: () => setOpen(!open),
      },
      t('business.choosePeople', { count: r.users.length })
    ),
    r.users.length > 0
      ? el(
          'p',
          { key: 'n', className: 'meta', 'data-people': r.users.join(',') },
          r.users.map((id) => names.get(id) ?? id).join(', ')
        )
      : null,
    open
      ? el(
          'ul',
          { key: 'p', className: 'chat-pick-list business-people' },
          persons.map((c) =>
            el(
              'li',
              { key: c.chat },
              el('label', { className: 'chat-pick-row' }, [
                el('input', {
                  key: 'i',
                  type: 'checkbox',
                  'data-person': c.chat,
                  checked: r.users.includes(c.chat),
                  onChange: () =>
                    setForm({ ...form, recipients: withPerson(r, c.chat) }),
                }),
                el('span', { key: 'n' }, c.name),
              ])
            )
          )
        )
      : null,
  ]);
};

const Days = ({ t, form, setForm }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 't', className: 'meta' }, t('business.noActivity')),
    el(
      'select',
      {
        key: 's',
        'data-field': 'no-activity-days',
        value: String(form.noActivityDays),
        onChange: (e) =>
          setForm({ ...form, noActivityDays: Number(e.target.value) }),
      },
      DAYS.map((d) =>
        el(
          'option',
          { key: d, value: String(d) },
          t('business.days', { count: d })
        )
      )
    ),
  ]);

const Schedule = ({ t, form, setForm }) =>
  el('fieldset', { className: 'business-schedule' }, [
    el('legend', { key: 'g' }, t('business.schedule')),
    ...['always', 'outside', 'custom'].map((kind) =>
      el('label', { key: kind, className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name: 'schedule',
          'data-schedule': kind,
          checked: form.scheduleKind === kind,
          onChange: () => setForm({ ...form, scheduleKind: kind }),
        }),
        ` ${t(`business.schedule.${kind}`)}`,
      ])
    ),
    form.scheduleKind === 'custom'
      ? el('div', { key: 'r', className: 'business-range' }, [
          el('label', { key: 's', className: 'chat-form-field' }, [
            el('span', { key: 't', className: 'meta' }, t('business.from')),
            el('input', {
              key: 'i',
              type: 'datetime-local',
              'data-field': 'start',
              value: form.start,
              onChange: (e) => setForm({ ...form, start: e.target.value }),
            }),
          ]),
          el('label', { key: 'e', className: 'chat-form-field' }, [
            el('span', { key: 't', className: 'meta' }, t('business.to')),
            el('input', {
              key: 'i',
              type: 'datetime-local',
              'data-field': 'end',
              value: form.end,
              onChange: (e) => setForm({ ...form, end: e.target.value }),
            }),
          ]),
        ])
      : null,
    el(Check, {
      key: 'o',
      name: 'offline-only',
      label: t('business.offlineOnly'),
      on: form.offlineOnly,
      onChange: (on) => setForm({ ...form, offlineOnly: on }),
    }),
  ]);

// What Telegram has, asked on mount and again after the shortcuts changed.
const useBusiness = (api, kind, again) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    api
      .telegramBusinessMessages()
      .catch(() => null)
      .then((a) => {
        if (!live) {
          return;
        }
        setState(
          a?.ok
            ? {
                phase: 'ready',
                data: a,
                form: formOf(kind, a[kind], a.shortcuts ?? [], nowSeconds()),
              }
            : { phase: 'error', code: a?.code ?? 'failed' }
        );
      });
    return () => {
      live = false;
    };
  }, [api, kind, again]);
  return [state, setState];
};

const Form = ({ api, t, kind, state, setState, reload, close }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [replies, setReplies] = useState(false);
  const chats = useChatChoices(api, true);
  const { form, data } = state;
  const setForm = (next) => setState({ ...state, form: next });
  const submit = async () => {
    const { body, problem } = requestOf(kind, form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const answer = await api[SAVE[kind]](body).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  if (replies) {
    return el(QuickRepliesDialog, {
      api,
      suggest: data.shortcuts.some((s) => s.name === SPECIAL[kind])
        ? null
        : SPECIAL[kind],
      close: () => {
        forgetQuickReplies();
        reload();
      },
    });
  }
  return el(
    FormDialog,
    {
      name: `business-${kind}`,
      title: t(`business.${kind}.title`),
      onClose: close,
      onSubmit: submit,
      submit: t('business.save'),
      busy,
      error: error ? errorText(t, error) : null,
      outside: true,
    },
    [
      el('p', { key: 'i', className: 'meta' }, t(`business.${kind}.intro`)),
      el(Check, {
        key: 'on',
        name: 'enabled',
        label: t(`business.${kind}.on`),
        on: form.enabled,
        onChange: (on) => setForm({ ...form, enabled: on }),
      }),
      form.enabled
        ? el(ShortcutPick, {
            key: 'sc',
            t,
            kind,
            shortcuts: data.shortcuts,
            value: form.shortcutId,
            set: (shortcutId) => setForm({ ...form, shortcutId }),
            onEdit: () => setReplies(true),
          })
        : null,
      form.enabled
        ? el(People, {
            key: 'pe',
            t,
            form,
            setForm,
            people: (data.people ?? []).map((p) => [p.id, p.name]),
            chats,
          })
        : null,
      form.enabled && kind === 'greeting'
        ? el(Days, { key: 'd', t, form, setForm })
        : null,
      form.enabled && kind === 'away'
        ? el(Schedule, { key: 'sch', t, form, setForm })
        : null,
    ]
  );
};

/** The greeting or away message form (`kind`) in a dialog. */
export const BusinessMessageDialog = ({ api, kind, close }) => {
  const t = useT();
  const [again, setAgain] = useState(0);
  const [state, setState] = useBusiness(api, kind, again);
  const reload = () => {
    setState({ phase: 'loading' });
    setAgain((n) => n + 1);
  };
  if (state.phase !== 'ready') {
    const failed = state.phase === 'error';
    return el(
      FormDialog,
      {
        name: `business-${kind}`,
        title: t(`business.${kind}.title`),
        onClose: close,
        onSubmit: close,
        submit: t('chat.create.cancel'),
        busy: false,
        error: failed ? errorText(t, state.code) : null,
        outside: true,
      },
      failed ? null : el('p', { className: 'meta' }, t('quick.loading'))
    );
  }
  return el(Form, { api, t, kind, state, setState, reload, close });
};
