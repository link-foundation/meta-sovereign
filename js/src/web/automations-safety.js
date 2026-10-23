// Send safety on the Automations page (R-Z3): the send log (every
// automated send and whether it went out, with the unknown ones for the
// user to settle), quiet hours and the "never message" list.

import React, { useState } from 'react';
import { useDates, useT } from './i18n.js';
import { useLoaded } from './chat-state.js';

const el = React.createElement;

const STATUSES = ['sending', 'sent', 'failed', 'unknown'];

// One send in the log; an unknown one asks what happened.
const OutboxRow = ({ record, resolve }) => {
  const t = useT();
  const { dateTime } = useDates();
  const status = STATUSES.includes(record.status) ? record.status : 'failed';
  return el(
    'li',
    {
      className: `outbox-row outbox-${status}`,
      'data-outbox': status,
      'data-id': record.id,
    },
    [
      el(
        'span',
        { key: 's', className: 'outbox-status' },
        t(`safety.status.${status}`)
      ),
      ` ${record.source}:${record.chat ?? ''} `,
      el('span', { key: 'a', className: 'meta' }, dateTime(record.at)),
      record.text
        ? el('div', { key: 't', className: 'meta' }, record.text.slice(0, 160))
        : null,
      record.error
        ? el('div', { key: 'e', className: 'meta' }, record.error)
        : null,
      status === 'unknown'
        ? el(
            'div',
            { key: 'b', className: 'row' },
            [
              ['sent', 'safety.outbox.arrived'],
              ['failed', 'safety.outbox.notArrived'],
            ].map(([decision, label]) =>
              el(
                'button',
                {
                  key: decision,
                  type: 'button',
                  'data-action': `outbox-${decision}`,
                  onClick: () => resolve(record.id, decision),
                },
                t(label)
              )
            )
          )
        : null,
    ]
  );
};

const Outbox = ({ api }) => {
  const t = useT();
  const [tick, setTick] = useState(0);
  const [records] = useLoaded(() => api.outbox(), [api, tick], []);
  const resolve = async (id, decision) => {
    await api.resolveOutbox({ id, decision });
    setTick((n) => n + 1);
  };
  const unknown = records.some((r) => r.status === 'unknown');
  return el('section', { className: 'card automation-outbox' }, [
    el('h3', { key: 'h' }, t('safety.outbox.title')),
    unknown
      ? el('p', { key: 'u', className: 'meta' }, t('safety.outbox.unknownHint'))
      : null,
    records.length === 0
      ? el('p', { key: 'n', className: 'meta' }, t('safety.outbox.empty'))
      : el(
          'ul',
          { key: 'l', className: 'outbox-list' },
          records
            .slice(0, 50)
            .map((record) => el(OutboxRow, { key: record.id, record, resolve }))
        ),
  ]);
};

const Field = ({ label, children }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'l', className: 'field-label' }, label),
    children,
  ]);

const OptOutForm = ({ add }) => {
  const t = useT();
  const [draft, setDraft] = useState({ source: '', chat: '', note: '' });
  const set = (name) => (event) =>
    setDraft({ ...draft, [name]: event.target.value });
  const submit = async () => {
    if (draft.source.trim() && draft.chat.trim()) {
      await add({
        source: draft.source.trim(),
        chat: draft.chat.trim(),
        note: draft.note.trim(),
      });
      setDraft({ source: '', chat: '', note: '' });
    }
  };
  return el(
    'div',
    { className: 'row optout-form' },
    [
      ['source', 'safety.optout.network'],
      ['chat', 'safety.optout.chat'],
      ['note', 'safety.optout.note'],
    ]
      .map(([name, label]) =>
        el(Field, { key: name, label: t(label) }, [
          el('input', {
            key: 'i',
            value: draft[name],
            'data-field': `optout-${name}`,
            onChange: set(name),
          }),
        ])
      )
      .concat(
        el(
          'button',
          {
            key: 'add',
            type: 'button',
            'data-action': 'optout-add',
            onClick: submit,
          },
          t('safety.optout.add')
        )
      )
  );
};

const QuietHours = ({ settings, save }) => {
  const t = useT();
  const [form, setForm] = useState(null);
  const shown = form ?? settings.quietHours;
  const zone = form?.timezone ?? settings.timezone ?? '';
  const change = (patch) => setForm({ ...shown, timezone: zone, ...patch });
  return el('div', { className: 'col quiet-hours' }, [
    el('h4', { key: 'h' }, t('safety.quiet.title')),
    el('label', { key: 'c', className: 'check' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        'data-field': 'quiet-enabled',
        checked: shown.enabled !== false,
        onChange: (event) => change({ enabled: event.target.checked }),
      }),
      ` ${t('safety.quiet.enabled')}`,
    ]),
    el(
      'div',
      { key: 'r', className: 'row' },
      [
        ['from', 'safety.quiet.from'],
        ['to', 'safety.quiet.to'],
      ].map(([name, label]) =>
        el(Field, { key: name, label: t(label) }, [
          el('input', {
            key: 'i',
            type: 'time',
            'data-field': `quiet-${name}`,
            value: shown[name],
            onChange: (event) => change({ [name]: event.target.value }),
          }),
        ])
      )
    ),
    el(Field, { key: 'z', label: t('safety.quiet.zone') }, [
      el('input', {
        key: 'i',
        value: zone,
        'data-field': 'quiet-zone',
        onChange: (event) => change({ timezone: event.target.value }),
      }),
    ]),
    el(
      'button',
      {
        key: 's',
        type: 'button',
        'data-action': 'quiet-save',
        onClick: () =>
          save({
            quietHours: {
              enabled: shown.enabled,
              from: shown.from,
              to: shown.to,
            },
            timezone: zone.trim() || null,
          }),
      },
      t('safety.quiet.save')
    ),
  ]);
};

const Settings = ({ api }) => {
  const t = useT();
  const [tick, setTick] = useState(0);
  const [saved, setSaved] = useState(false);
  const [settings] = useLoaded(() => api.safetySettings(), [api, tick], null);
  if (!settings) {
    return null;
  }
  const save = async (patch) => {
    await api.saveSafetySettings({ ...settings, ...patch });
    setSaved(true);
    setTick((n) => n + 1);
  };
  const remove = (entry) =>
    save({ optOut: settings.optOut.filter((e) => e !== entry) });
  return el('section', { className: 'card automation-optout' }, [
    el('h3', { key: 'h' }, t('safety.optout.title')),
    el('p', { key: 'i', className: 'meta' }, t('safety.optout.intro')),
    settings.optOut.length === 0
      ? el('p', { key: 'n', className: 'meta' }, t('safety.optout.empty'))
      : el(
          'ul',
          { key: 'l', className: 'optout-list' },
          settings.optOut.map((entry) =>
            el(
              'li',
              {
                key: `${entry.source}:${entry.chat ?? entry.contact}`,
                'data-optout': `${entry.source}:${entry.chat ?? entry.contact}`,
              },
              [
                `${entry.source}:${entry.chat ?? entry.contact} `,
                entry.note
                  ? el('span', { key: 'n', className: 'meta' }, entry.note)
                  : null,
                el(
                  'button',
                  {
                    key: 'x',
                    type: 'button',
                    'data-action': 'optout-remove',
                    onClick: () => remove(entry),
                  },
                  t('safety.optout.remove')
                ),
              ]
            )
          )
        ),
    el(OptOutForm, {
      key: 'f',
      add: (entry) =>
        save({
          optOut: [
            ...settings.optOut,
            { ...entry, at: new Date().toISOString() },
          ],
        }),
    }),
    el(QuietHours, { key: 'q', settings, save }),
    saved ? el('p', { key: 's', className: 'meta' }, t('safety.saved')) : null,
  ]);
};

/** The send log, quiet hours and the opt-out list. */
export const SafetyPanel = ({ api }) => {
  const t = useT();
  if (!api?.outbox) {
    return null;
  }
  return el(
    'div',
    { className: 'automation-safety col', 'data-panel': 'safety' },
    [
      el('h2', { key: 'h' }, t('safety.title')),
      el('p', { key: 'i', className: 'meta' }, t('safety.intro')),
      el('div', { key: 'b', className: 'automations-body' }, [
        el(Outbox, { key: 'o', api }),
        el(Settings, { key: 's', api }),
      ]),
    ]
  );
};
