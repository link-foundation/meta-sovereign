// The Automations screen (issue #31 / PR #34). Instead of one screen per
// feature, every outreach is an automation the user can change: who it
// is for (an audience merged from friends, chats, communities and
// lists), when it fires (by hand, from a chat's menu, on a schedule, on
// an incoming message), the conditions (e.g. no talk for 90 days), the
// message in "ты" and "вы" forms, safe or automatic sending and pacing.
// The preview shows who would be messaged and why the rest are left
// out; people can be searched, picked and run on directly.

import React from 'react';
import { api as defaultApi } from './dom.js';
import { sentence, useDates, useT } from './i18n.js';
import { reasonText } from './chat-view.js';
import { Icon } from './icons.js';
import { networkName } from './connection-guides.js';
import { useAutomationsState } from './automations-state.js';
import { exclusionSummary } from './automations-model.js';

const el = React.createElement;

const field = (props, control) =>
  el('label', { className: 'field', key: props.name }, [
    el('span', { key: 'l', className: 'field-label' }, sentence(props.label)),
    control,
    props.hint
      ? el('small', { key: 'h', className: 'meta' }, props.hint)
      : null,
  ]);

const Input = ({ form, set, error, name, label, hint, ...rest }) =>
  field(
    { name, label, hint },
    el(rest.multiline ? 'textarea' : 'input', {
      key: 'c',
      name,
      value: form[name] ?? '',
      rows: rest.multiline || undefined,
      inputMode: rest.numeric ? 'decimal' : undefined,
      placeholder: rest.placeholder,
      'aria-invalid': error?.field === name ? 'true' : undefined,
      onChange: (event) => set(name, event.target.value),
    })
  );

const Check = ({ form, set, name, label }) =>
  el('label', { className: 'check', key: name }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      name,
      checked: Boolean(form[name]),
      onChange: (event) => set(name, event.target.checked),
    }),
    ` ${sentence(label)}`,
  ]);

const Choice = ({ form, set, name, label, options }) =>
  field(
    { name, label },
    el(
      'select',
      {
        key: 'c',
        name,
        value: form[name],
        onChange: (event) => set(name, event.target.value),
      },
      options.map(([value, text]) =>
        el('option', { key: value, value }, sentence(text))
      )
    )
  );

const Fieldset = ({ legend, children }) =>
  el('fieldset', { className: 'automation-fieldset' }, [
    el('legend', { key: 'l' }, legend),
    ...React.Children.toArray(children),
  ]);

const NOTICE = {
  saved: 'automations.notice.saved',
  deleted: 'automations.notice.deleted',
  'list-saved': 'automations.notice.listSaved',
  'audience-saved': 'automations.notice.audienceSaved',
  queued: 'automations.notice.queued',
  nothing: 'chat.notice.nothing',
  'sent-auto': 'chat.notice.sentAuto',
  failed: 'chat.notice.failed',
};

const Notice = ({ notice, dismiss }) => {
  const t = useT();
  if (!notice) {
    return null;
  }
  return el(
    'div',
    {
      className: `chat-notice ${notice.kind}`,
      role: notice.kind === 'failed' ? 'alert' : 'status',
      'data-notice': notice.kind,
    },
    [
      el(
        'span',
        { key: 'text' },
        t(NOTICE[notice.kind] ?? NOTICE.failed, {
          count: notice.count ?? 0,
          name: notice.name ?? '',
          error: notice.error ?? '',
          reason: reasonText(t, notice.reason),
        })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'icon-btn',
          'aria-label': t('chat.notice.dismiss'),
          title: t('chat.notice.dismiss'),
          onClick: dismiss,
        },
        el(Icon, { name: 'close', size: 16 })
      ),
    ]
  );
};

const triggerSummary = (t, automation) =>
  (automation.triggers ?? [])
    .map((trigger) => t(`automations.trigger.${trigger.kind}`))
    .join(' · ');

const AutomationList = ({ editor }) => {
  const t = useT();
  return el('ul', { className: 'automation-list' }, [
    ...editor.list.map((automation) =>
      el(
        'li',
        {
          key: automation.id,
          className: editor.current?.id === automation.id ? 'active' : '',
        },
        el(
          'button',
          {
            type: 'button',
            'data-automation': automation.id,
            disabled: Boolean(automation.invalid),
            onClick: () => editor.open(automation),
          },
          [
            el('strong', { key: 'n' }, automation.name),
            el(
              'span',
              { key: 'm', className: 'meta' },
              automation.invalid ??
                sentence(
                  [
                    t(`automations.mode.${automation.mode}`),
                    triggerSummary(t, automation),
                    automation.saved ? null : t('automations.preset'),
                    automation.enabled ? null : t('automations.off'),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                )
            ),
          ]
        )
      )
    ),
  ]);
};

const editorFields = ({ form, set, error, t }) => {
  const p = { form, set, error };
  return [
    el(Fieldset, { key: 'about', legend: t('automations.section.about') }, [
      el(Input, {
        ...p,
        key: 'n',
        name: 'name',
        label: t('automations.field.name'),
      }),
      el(Input, {
        ...p,
        key: 'd',
        name: 'description',
        label: t('automations.field.description'),
        multiline: 3,
      }),
      el(Check, {
        ...p,
        key: 'e',
        name: 'enabled',
        label: t('automations.field.enabled'),
      }),
      el(Choice, {
        ...p,
        key: 'm',
        name: 'mode',
        label: t('automations.field.mode'),
        options: ['safe', 'auto'].map((m) => [m, t(`automations.mode.${m}`)]),
      }),
    ]),
    el(Fieldset, { key: 'when', legend: t('automations.section.triggers') }, [
      el(Check, {
        ...p,
        key: 'm',
        name: 'manual',
        label: t('automations.trigger.manual'),
      }),
      el(Check, {
        ...p,
        key: 'c',
        name: 'chatMenu',
        label: t('automations.trigger.chat-menu'),
      }),
      el(Input, {
        ...p,
        key: 's',
        name: 'schedule',
        label: t('automations.trigger.schedule'),
        placeholder: '1d',
        hint: t('automations.hint.schedule'),
      }),
      el(Input, {
        ...p,
        key: 'i',
        name: 'incoming',
        label: t('automations.trigger.incoming'),
        placeholder: '^(привет|hi)',
        hint: t('automations.hint.incoming'),
      }),
    ]),
  ];
};

const audienceFields = ({ form, set, error, t, state }) => {
  const p = { form, set, error };
  const lastFrom = ['any', 'me', 'contact'];
  return [
    el(Fieldset, { key: 'who', legend: t('automations.section.audience') }, [
      el(Input, {
        ...p,
        key: 'a',
        name: 'audience',
        label: t('automations.field.audience'),
        placeholder: 'friends:vk & chat:vk:2000000001 - list:blocked',
        hint: t('automations.hint.audience'),
      }),
      state.audiences.saved.length || state.people.selected.length
        ? el('div', { key: 'use', className: 'row chips' }, [
            state.people.selected.length
              ? el(
                  'button',
                  {
                    key: 'sel',
                    type: 'button',
                    className: 'chip',
                    onClick: () => state.applyAudience(state.people.spec),
                  },
                  t('automations.useSelection', {
                    count: state.people.selected.length,
                  })
                )
              : null,
            ...state.audiences.saved.map((a) =>
              el(
                'button',
                {
                  key: a.id,
                  type: 'button',
                  className: 'chip',
                  onClick: () => state.applyAudience(a.id),
                },
                a.name
              )
            ),
          ])
        : null,
    ]),
    el(Fieldset, { key: 'if', legend: t('automations.section.conditions') }, [
      el(Input, {
        ...p,
        key: 's',
        name: 'silentDays',
        numeric: true,
        label: t('automations.field.silentDays'),
      }),
      el(Input, {
        ...p,
        key: 'c',
        name: 'cooldownDays',
        numeric: true,
        label: t('automations.field.cooldownDays'),
      }),
      el(Check, {
        ...p,
        key: 'm',
        name: 'mutual',
        label: t('automations.field.mutual'),
      }),
      el(Check, {
        ...p,
        key: 'p',
        name: 'personal',
        label: t('automations.field.personal'),
      }),
      el(Choice, {
        ...p,
        key: 'l',
        name: 'lastFrom',
        label: t('automations.field.lastFrom'),
        options: lastFrom.map((v) => [v, t(`automations.lastFrom.${v}`)]),
      }),
      el(Input, {
        ...p,
        key: 'n',
        name: 'networks',
        label: t('automations.field.networks'),
        placeholder: 'vk, telegram',
      }),
    ]),
  ];
};

const messageFields = ({ form, set, error, t }) => {
  const p = { form, set, error };
  return [
    el(Fieldset, { key: 'what', legend: t('automations.section.message') }, [
      el(Choice, {
        ...p,
        key: 'f',
        name: 'form',
        label: t('automations.field.form'),
        options: ['auto', 'informal', 'formal'].map((f) => [
          f,
          t(`automations.form.${f}`),
        ]),
      }),
      el(Input, {
        ...p,
        key: 'i',
        name: 'informal',
        multiline: 6,
        label: t('automations.form.informal'),
      }),
      el(Input, {
        ...p,
        key: 'o',
        name: 'formal',
        multiline: 6,
        label: t('automations.form.formal'),
        hint: t('automations.hint.template'),
      }),
    ]),
    el(Fieldset, { key: 'pace', legend: t('automations.section.pacing') }, [
      el(Input, {
        ...p,
        key: 'l',
        name: 'limit',
        numeric: true,
        label: t('automations.field.limit'),
      }),
      el(Input, {
        ...p,
        key: 'c',
        name: 'dailyCap',
        numeric: true,
        label: t('automations.field.dailyCap'),
      }),
      el(Input, {
        ...p,
        key: 'n',
        name: 'minDelay',
        numeric: true,
        label: t('automations.field.minDelay'),
      }),
      el(Input, {
        ...p,
        key: 'x',
        name: 'maxDelay',
        numeric: true,
        label: t('automations.field.maxDelay'),
      }),
      el(Check, {
        ...p,
        key: 't',
        name: 'typing',
        label: t('automations.field.typing'),
      }),
    ]),
  ];
};

const EditorActions = ({ state, t }) => {
  const { editor, runs } = state;
  const auto = editor.form.mode === 'auto';
  return el('div', { className: 'row automation-actions' }, [
    el(
      'button',
      { key: 'save', type: 'submit', className: 'primary' },
      t('common.save')
    ),
    el(
      'button',
      {
        key: 'preview',
        type: 'button',
        disabled: runs.busy,
        onClick: () => runs.preview(),
      },
      t('automations.preview')
    ),
    el(
      'button',
      {
        key: 'run',
        type: 'button',
        'data-action': 'run-automation',
        disabled: runs.busy,
        onClick: () => runs.run(),
      },
      t(auto ? 'automations.runAuto' : 'automations.runSafe')
    ),
    editor.current?.saved
      ? el(
          'button',
          {
            key: 'del',
            type: 'button',
            className: 'danger',
            onClick: editor.remove,
          },
          t('automations.delete')
        )
      : null,
    el(
      'button',
      {
        key: 'close',
        type: 'button',
        className: 'link',
        onClick: editor.close,
      },
      t('automations.close')
    ),
  ]);
};

const Editor = ({ state }) => {
  const t = useT();
  const { editor } = state;
  const props = {
    form: editor.form,
    set: editor.setField,
    error: editor.error,
    t,
    state,
  };
  return el(
    'form',
    {
      className: 'automation-editor',
      'aria-label': t('automations.edit', { name: editor.form.name }),
      onSubmit: (event) => {
        event.preventDefault();
        editor.save();
      },
    },
    [
      ...editorFields(props),
      ...audienceFields(props),
      ...messageFields(props),
      editor.error
        ? el(
            'p',
            { key: 'err', className: 'error', role: 'alert' },
            [
              t(editor.error.error),
              editor.error.detail ? `: ${editor.error.detail}` : '',
            ].join('')
          )
        : null,
      el(EditorActions, { key: 'act', state, t }),
    ]
  );
};

const PlanPreview = ({ runs }) => {
  const t = useT();
  const { plan } = runs;
  if (!plan) {
    return null;
  }
  return el(
    'section',
    { className: 'card automation-plan', 'aria-live': 'polite' },
    [
      el(
        'h3',
        { key: 'h' },
        t('automations.plan.title', { count: plan.total ?? plan.drafts.length })
      ),
      el(
        'p',
        { key: 'm', className: 'meta' },
        t('automations.plan.nothingSent')
      ),
      el(
        'ol',
        { key: 'd', className: 'automation-drafts' },
        plan.drafts.map((draft) =>
          el('li', { key: draft.id }, [
            el('strong', { key: 'n' }, draft.name ?? draft.chat),
            el(
              'span',
              { key: 's', className: 'meta' },
              // The chat id only adds something next to a real name.
              ` ${
                draft.name && draft.name !== draft.chat
                  ? `${draft.source}:${draft.chat}`
                  : networkName(t, draft.source)
              } · ${t(`automations.form.${draft.form}`)}`
            ),
            el('blockquote', { key: 't' }, draft.text),
          ])
        )
      ),
      plan.excluded?.length
        ? el(
            'p',
            { key: 'x', className: 'meta' },
            t('automations.plan.leftOut', {
              reasons: exclusionSummary(plan.excluded)
                .map(
                  ({ reason, count }) => `${reasonText(t, reason)} × ${count}`
                )
                .join(', '),
            })
          )
        : null,
      el(
        'button',
        {
          key: 'c',
          type: 'button',
          className: 'link',
          onClick: runs.clearPlan,
        },
        t('automations.close')
      ),
    ]
  );
};

const History = ({ runs }) => {
  const t = useT();
  const { dateTime: fmtTs } = useDates();
  if (runs.history.length === 0) {
    return null;
  }
  return el('section', { className: 'card' }, [
    el('h3', { key: 'h' }, t('automations.history')),
    el(
      'ul',
      { key: 'l', className: 'automation-history' },
      runs.history
        .slice(0, 50)
        .map((r) =>
          el('li', { key: r.id }, [
            el(
              'span',
              { key: 's', className: `status ${r.status}` },
              t(`automations.status.${r.status}`)
            ),
            ` ${r.source}:${r.chat} `,
            el('span', { key: 'a', className: 'meta' }, fmtTs(r.at)),
            r.text ? el('div', { key: 't', className: 'meta' }, r.text) : null,
          ])
        )
    ),
  ]);
};

const PeoplePanel = ({ state }) => {
  const t = useT();
  const { dateTime: fmtTs } = useDates();
  const { people, runs, editor } = state;
  const [test, setTest] = React.useState(false);
  const [listName, setListName] = React.useState('');
  const picked = people.selected.length;
  return el('section', { className: 'card automation-people' }, [
    el('h3', { key: 'h' }, t('automations.people.title')),
    el('input', {
      key: 'q',
      type: 'search',
      value: people.query,
      placeholder: t('automations.people.search'),
      'aria-label': t('automations.people.search'),
      onChange: (event) => people.setQuery(event.target.value),
    }),
    el(
      'ul',
      { key: 'r', className: 'people-results' },
      people.results.map((person) =>
        el('li', { key: person.key }, [
          el('label', { key: 'c', className: 'check' }, [
            el('input', {
              key: 'i',
              type: 'checkbox',
              checked: people.isSelected(person),
              onChange: () => people.toggle(person),
            }),
            ` ${person.name ?? person.key}`,
          ]),
          el(
            'span',
            { key: 'm', className: 'meta' },
            [
              // A nameless person is already labelled by their id.
              person.name ? person.key : null,
              person.handle ? `@${person.handle}` : null,
              person.lastAt ? fmtTs(person.lastAt) : null,
              person.sameAs?.length
                ? t('automations.people.sameAs', {
                    count: person.sameAs.length,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          ),
        ])
      )
    ),
    picked
      ? el('div', { key: 'sel', className: 'col' }, [
          el(
            'p',
            { key: 'n', className: 'meta' },
            t('automations.people.selected', { count: picked })
          ),
          editor.form
            ? el('div', { key: 'run', className: 'row' }, [
                el('label', { key: 't', className: 'check' }, [
                  el('input', {
                    key: 'i',
                    type: 'checkbox',
                    checked: test,
                    onChange: (event) => setTest(event.target.checked),
                  }),
                  ` ${t('automations.people.test')}`,
                ]),
                el(
                  'button',
                  {
                    key: 'p',
                    type: 'button',
                    onClick: () => runs.preview({ onSelected: true, test }),
                  },
                  t('automations.preview')
                ),
                el(
                  'button',
                  {
                    key: 'r',
                    type: 'button',
                    onClick: () => runs.run({ onSelected: true, test }),
                  },
                  t('automations.people.run', { name: editor.form.name })
                ),
              ])
            : el(
                'p',
                { key: 'pick', className: 'meta' },
                t('automations.people.pickAutomation')
              ),
          el('div', { key: 'list', className: 'row' }, [
            el('input', {
              key: 'n',
              value: listName,
              placeholder: t('automations.people.listName'),
              'aria-label': t('automations.people.listName'),
              onChange: (event) => setListName(event.target.value),
            }),
            el(
              'button',
              {
                key: 's',
                type: 'button',
                disabled: !listName.trim(),
                onClick: async () => {
                  await people.saveList(listName);
                  setListName('');
                },
              },
              t('automations.people.saveList')
            ),
            el(
              'button',
              {
                key: 'c',
                type: 'button',
                className: 'link',
                onClick: people.clear,
              },
              t('automations.people.clear')
            ),
          ]),
        ])
      : null,
  ]);
};

const AudiencesPanel = ({ state }) => {
  const t = useT();
  const { audiences } = state;
  const { count } = audiences;
  return el('section', { className: 'card automation-audiences' }, [
    el('h3', { key: 'h' }, t('automations.audiences.title')),
    el('p', { key: 'i', className: 'meta' }, t('automations.hint.audience')),
    el(
      'ul',
      { key: 'l' },
      audiences.saved.map((a) =>
        el('li', { key: a.id }, [
          el('strong', { key: 'n' }, a.name),
          el('code', { key: 's' }, ` ${a.text ?? a.id} `),
          state.editor.form
            ? el(
                'button',
                {
                  key: 'u',
                  type: 'button',
                  className: 'link',
                  onClick: () => state.applyAudience(a.id),
                },
                t('automations.audiences.use')
              )
            : null,
          el(
            'button',
            {
              key: 'd',
              type: 'button',
              className: 'link',
              onClick: () => audiences.remove(a.id),
            },
            t('automations.delete')
          ),
        ])
      )
    ),
    el(
      'form',
      {
        key: 'f',
        className: 'row',
        onSubmit: (event) => {
          event.preventDefault();
          audiences.save();
        },
      },
      [
        el('input', {
          key: 'n',
          value: audiences.name,
          placeholder: t('automations.field.name'),
          'aria-label': t('automations.field.name'),
          className: 'narrow',
          onChange: (event) => audiences.setName(event.target.value),
        }),
        el('input', {
          key: 's',
          value: audiences.spec,
          placeholder: 'friends:vk & chat:vk:2000000001',
          'aria-label': t('automations.field.audience'),
          className: 'grow',
          onChange: (event) => audiences.setSpec(event.target.value),
        }),
        el(
          'button',
          {
            key: 'c',
            type: 'button',
            disabled: !audiences.spec.trim(),
            onClick: () => audiences.resolve(),
          },
          t('automations.audiences.count')
        ),
        el(
          'button',
          {
            key: 'v',
            type: 'submit',
            disabled: !audiences.name.trim() || !audiences.spec.trim(),
          },
          t('common.save')
        ),
      ]
    ),
    count
      ? el(
          'p',
          {
            key: 'r',
            className: count.error ? 'error' : 'meta',
            role: count.error ? 'alert' : 'status',
          },
          count.error ??
            t('automations.audiences.resolved', {
              count: count.count,
              names: count.people
                .slice(0, 5)
                .map((p) => p.name ?? p.key)
                .join(', '),
            })
        )
      : null,
  ]);
};

/** The screen itself, pure: everything comes from `state`. */
export const AutomationsScreen = ({ state }) => {
  const t = useT();
  const { editor } = state;
  return el('div', { className: 'automations col' }, [
    el('div', { key: 'h', className: 'row automations-head' }, [
      el('h2', { key: 't' }, t('automations.title')),
      el(
        'button',
        {
          key: 'n',
          type: 'button',
          className: 'primary',
          onClick: editor.create,
        },
        t('automations.new')
      ),
    ]),
    el('p', { key: 'i', className: 'meta' }, t('automations.intro')),
    el(Notice, { key: 'notice', notice: state.notice, dismiss: state.dismiss }),
    el('div', { key: 'b', className: 'automations-body' }, [
      editor.loading
        ? el('div', { key: 'l', className: 'meta' }, t('common.loading'))
        : el(AutomationList, { key: 'l', editor }),
      el('div', { key: 'e', className: 'col' }, [
        editor.form
          ? el(Editor, { key: 'ed', state })
          : el(
              'p',
              { key: 'pick', className: 'meta automation-pick' },
              t('automations.pick')
            ),
        el(PlanPreview, { key: 'plan', runs: state.runs }),
        editor.form ? el(History, { key: 'hist', runs: state.runs }) : null,
      ]),
    ]),
    el('div', { key: 'p', className: 'automations-body' }, [
      el(PeoplePanel, { key: 'people', state }),
      el(AudiencesPanel, { key: 'aud', state }),
    ]),
  ]);
};

export const AutomationsView = ({ api = defaultApi, ...options }) => {
  const t = useT();
  return el(AutomationsScreen, {
    state: useAutomationsState(api, { t, ...options }),
  });
};
