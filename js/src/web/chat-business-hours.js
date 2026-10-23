// Opening hours, as Telegram Desktop's Business hours edits them (R-Y180;
// learned, never copied): a switch to show them on the profile, the time
// zone, and for each weekday closed, open all day, or one or more
// intervals. Nothing is sent until Save; Telegram's refusals (it needs
// Premium) show in words.

import React, { useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { FormDialog } from './chat-create.js';
import {
  errorText,
  useBusinessRead,
  useSaving,
} from './chat-business-common.js';
import {
  DAY,
  allDay,
  dayNames,
  daysProblem,
  formatTime,
  myZone,
  offsetMinutes,
  parseTime,
  toDays,
  toWeekly,
  zoneLabel,
} from './business-hours-model.js';

const el = React.createElement;

const WORKDAY = { from: 9 * 60, to: 18 * 60 };

/** The hours to start from: Telegram's, else Monday to Friday 9 to 18. */
export const startDays = (hours) =>
  hours
    ? toDays(hours.weekly)
    : Array.from({ length: 7 }, (_, i) => (i < 5 ? [{ ...WORKDAY }] : []));

// A new interval after the last: an hour, from where that one ends.
const nextRange = (last) => {
  const from = Math.min(last.to, DAY - 120);
  return { from, to: from + 60 };
};

const TimeBox = ({ field, value, set, label }) =>
  el('input', {
    type: 'time',
    // A day's end (24:00) shows as 23:59, the last minute a box holds.
    value: formatTime(value === DAY ? DAY - 1 : value),
    'data-field': field,
    'aria-label': label,
    onChange: (e) => {
      const minutes = parseTime(e.target.value);
      if (minutes !== null) {
        set(minutes);
      }
    },
  });

const RangeRow = ({ t, range, set, remove }) =>
  el('span', { className: 'business-range' }, [
    el(TimeBox, {
      key: 'f',
      field: 'from',
      value: range.from,
      label: t('chat.business.hours.from'),
      set: (from) => set({ ...range, from }),
    }),
    '–',
    el(TimeBox, {
      key: 't',
      field: 'to',
      value: range.to,
      label: t('chat.business.hours.to'),
      set: (to) => set({ ...range, to }),
    }),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'range-remove',
        'aria-label': t('chat.business.hours.removeRange'),
        onClick: remove,
      },
      '×'
    ),
  ]);

// One weekday: open or closed, all day, and its intervals.
const DayRow = ({ t, name, index, ranges, set }) => {
  const open = ranges.length > 0;
  const whole = allDay(ranges);
  const change = (i, range) => set(ranges.map((r, j) => (j === i ? range : r)));
  return el('div', { className: 'business-day', 'data-day': index }, [
    el('label', { key: 'o', className: 'business-day-name' }, [
      el('input', {
        key: 'c',
        type: 'checkbox',
        checked: open,
        'data-field': 'day-open',
        onChange: () => set(open ? [] : [{ ...WORKDAY }]),
      }),
      ` ${name}`,
    ]),
    open
      ? el('label', { key: 'a', className: 'business-day-all meta' }, [
          el('input', {
            key: 'c',
            type: 'checkbox',
            checked: whole,
            'data-field': 'day-all',
            onChange: () =>
              set(whole ? [{ ...WORKDAY }] : [{ from: 0, to: DAY }]),
          }),
          ` ${t('chat.business.hours.allDay')}`,
        ])
      : el(
          'span',
          { key: 'a', className: 'meta' },
          t('chat.business.hours.closed')
        ),
    ...(open && !whole
      ? ranges.map((range, i) =>
          el(RangeRow, {
            key: `r${i}`,
            t,
            range,
            set: (next) => change(i, next),
            remove: () => set(ranges.filter((_, j) => j !== i)),
          })
        )
      : []),
    open && !whole
      ? el(
          'button',
          {
            key: 'add',
            type: 'button',
            className: 'business-add',
            'data-action': 'range-add',
            onClick: () => set([...ranges, nextRange(ranges.at(-1))]),
          },
          t('chat.business.hours.addRange')
        )
      : null,
  ]);
};

// The zones Telegram lists, with this one among them.
const zonesWith = (list, zone) =>
  list.some((z) => z.id === zone)
    ? list
    : [
        { id: zone, name: zone, offset: offsetMinutes(zone, Date.now()) * 60 },
        ...list,
      ];

const HoursForm = ({ api, t, locale, close, data }) => {
  const [enabled, setEnabled] = useState(Boolean(data.hours));
  const [zone, setZone] = useState(data.hours?.timezone || myZone());
  const [days, setDays] = useState(() => startDays(data.hours));
  const saving = useSaving(t, close);
  const names = dayNames(locale);
  const submit = () => {
    const problem = enabled ? daysProblem(days) : null;
    const weekly = enabled ? toWeekly(days) : [];
    if (problem || (enabled && weekly.length === 0)) {
      saving.fail(problem ?? 'hours-invalid');
      return;
    }
    saving.save(() => api.telegramBusinessHoursSet({ timezone: zone, weekly }));
  };
  return el(
    FormDialog,
    {
      name: 'business-hours',
      title: t('chat.business.hours'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.business.save'),
      busy: saving.busy,
      error: saving.error,
      outside: true,
    },
    [
      el('label', { key: 'e', className: 'business-switch' }, [
        el('input', {
          key: 'c',
          type: 'checkbox',
          checked: enabled,
          'data-field': 'hours-enabled',
          onChange: () => setEnabled(!enabled),
        }),
        ` ${t('chat.business.hours.show')}`,
      ]),
      ...(enabled
        ? [
            el('label', { key: 'z', className: 'chat-form-field' }, [
              el(
                'span',
                { key: 'l', className: 'meta' },
                t('chat.business.hours.zone')
              ),
              el(
                'select',
                {
                  key: 's',
                  value: zone,
                  'data-field': 'zone',
                  onChange: (e) => setZone(e.target.value),
                },
                zonesWith(data.timezones ?? [], zone).map((z) =>
                  el('option', { key: z.id, value: z.id }, zoneLabel(z))
                )
              ),
            ]),
            ...days.map((ranges, i) =>
              el(DayRow, {
                key: `d${i}`,
                t,
                name: names[i],
                index: i,
                ranges,
                set: (next) =>
                  setDays(days.map((r, j) => (j === i ? next : r))),
              })
            ),
          ]
        : []),
    ]
  );
};

/** Settings → Business → Opening hours. */
export const HoursDialog = ({ api, close }) => {
  const { t, locale } = useLocaleContext();
  const read = useBusinessRead(() => api.telegramBusinessHours());
  if (read.phase === 'ready') {
    return el(HoursForm, { api, t, locale, close, data: read.data });
  }
  return el(
    FormDialog,
    {
      name: 'business-hours',
      title: t('chat.business.hours'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.create.cancel'),
      busy: false,
      error: read.phase === 'error' ? errorText(t, read.code) : null,
      outside: true,
    },
    read.phase === 'loading'
      ? el('p', { className: 'meta' }, t('chat.business.loading'))
      : null
  );
};
