import React, { useState } from 'react';
const el = React.createElement;
const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2020, month, 1))
  )
);

export const NativeMonth = ({ part, date, update }) => {
  const [open, setOpen] = useState(false);
  const value = months[Number(date.slice(5)) - 1];
  return el(
    'div',
    { 'data-qa': `resume-editor-experience-${part}-month-input` },
    [
      el(
        'button',
        {
          key: 'trigger',
          type: 'button',
          'data-qa': 'magritte-select-activator',
          onClick: () => setOpen(!open),
        },
        el('span', { 'data-qa': 'trigger-values-wrapper' }, value)
      ),
      open
        ? el(
            'div',
            { key: 'options', role: 'listbox' },
            months.map((name, index) =>
              el(
                'button',
                {
                  key: name,
                  role: 'option',
                  onClick: () => {
                    update(
                      `${date.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`
                    );
                    setOpen(false);
                  },
                },
                name
              )
            )
          )
        : null,
    ]
  );
};
export const NativeArea = ({ value, update }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  return el(
    'div',
    {
      'data-qa': 'resume-editor-experience-area-input',
      onClick: () => setOpen(true),
    },
    [
      el('span', { key: 'value', 'data-qa': 'trigger-values-wrapper' }, value),
      open
        ? el('div', { key: 'picker' }, [
            el('input', {
              key: 'query',
              role: 'combobox',
              'aria-label': 'City or region',
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            ...['Remote', 'Moscow']
              .filter((name) => name.includes(query))
              .map((name) =>
                el(
                  'button',
                  {
                    key: name,
                    role: 'option',
                    onClick: (event) => {
                      event.stopPropagation();
                      update(name);
                      setOpen(false);
                    },
                  },
                  name
                )
              ),
          ])
        : null,
    ]
  );
};
const entries = [
  { id: '7.540', name: 'Software' },
  { id: '7.541', name: 'Automation' },
];
export const NativeIndustries = ({ values, update }) => {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(values);
  const [query, setQuery] = useState('');
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'trigger',
        'data-qa': 'trigger-root',
        onClick: () => {
          setPicked(values);
          setOpen(true);
        },
      },
      [
        el('span', { key: 'label' }, 'Field of activity'),
        el(
          'span',
          { key: 'values', 'data-qa': 'trigger-values-wrapper' },
          entries
            .filter((row) => values.includes(row.id))
            .map((row) => row.name)
            .join(', ')
        ),
      ]
    ),
    open
      ? el(
          'section',
          { key: 'dialog', role: 'dialog', 'aria-label': 'Company industries' },
          [
            el('input', {
              key: 'query',
              'data-qa': 'tree-selector-search-input',
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            ...entries
              .filter((row) => row.name.includes(query))
              .map((row) =>
                el('label', { key: row.id }, [
                  el('input', {
                    key: 'box',
                    type: 'checkbox',
                    checked: picked.includes(row.id),
                    'data-qa': `tree-selector-input-${row.id.split('.')[1]}`,
                    onChange: (event) =>
                      setPicked(
                        event.target.checked
                          ? [...picked, row.id]
                          : picked.filter((id) => id !== row.id)
                      ),
                  }),
                  el(
                    'span',
                    {
                      key: 'name',
                      'data-qa': `tree-selector-item-text-${row.id.split('.')[1]}`,
                    },
                    row.name
                  ),
                ])
              ),
            el(
              'button',
              {
                key: 'save',
                'data-qa': 'profile-layout-save-button',
                onClick: () => {
                  update(picked);
                  setOpen(false);
                  globalThis.fixturePickerSaves++;
                },
              },
              'Save'
            ),
          ]
        )
      : null,
  ]);
};

export const NativeDates = ({ job }) => {
  const [start, setStart] = useState(job.start);
  const [end, setEnd] = useState(job.end ?? '2024-06');
  const [startYear, setStartYear] = useState(job.start.slice(0, 4));
  const [endYear, setEndYear] = useState((job.end ?? '2024-06').slice(0, 4));
  const [current, setCurrent] = useState(job.current);
  return el(React.Fragment, { key: 'full-dates' }, [
    ...['start', ...(current ? [] : ['end'])].map((part) => {
      const date = part === 'start' ? start : end;
      const update = part === 'start' ? setStart : setEnd;
      return el('div', { key: part }, [
        el(NativeMonth, { key: 'month', part, date, update }),
        el('input', {
          key: 'year',
          maxLength: 4,
          'data-qa': `resume-editor-experience-${part}-year-input`,
          value: part === 'start' ? startYear : endYear,
          onChange: (event) =>
            (part === 'start' ? setStartYear : setEndYear)(event.target.value),
        }),
      ]);
    }),
    el('input', {
      key: 'current',
      type: 'checkbox',
      'data-qa': 'resume-editor-experience-present-checkbox',
      checked: current,
      onChange: (event) => setCurrent(event.target.checked),
    }),
  ]);
};
