import React from 'react';

const el = React.createElement;
const Field = ({ name, t, children }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'label' }, t(`cvWorkplace.${name}`)),
    children,
  ]);
const DictionaryFields = ({ state, t }) => {
  const [areaQuery, setAreaQuery] = React.useState('');
  const [industryQuery, setIndustryQuery] = React.useState('');
  const language = state.source.identity.language;
  const areas = state.dictionaries.areas[language];
  const industries = state.dictionaries.industries[language];
  const filter = (rows, query) =>
    rows
      .filter((row) =>
        `${row.name} ${row.parent}`
          .toLocaleLowerCase(language)
          .includes(query.toLocaleLowerCase(language))
      )
      .slice(0, 50);
  const areaChoices = areas
    .filter((row) => row.id === state.fields.areaId)
    .concat(
      filter(areas, areaQuery).filter((row) => row.id !== state.fields.areaId)
    );
  const selected = state.fields.industryIds;
  const industryChoices = industries
    .filter((row) => selected.includes(row.id))
    .concat(
      filter(industries, industryQuery).filter(
        (row) => !selected.includes(row.id)
      )
    );
  return el('div', { className: 'col' }, [
    el(
      Field,
      { key: 'area-query', name: 'areaSearch', t },
      el('input', {
        key: 'input',
        type: 'search',
        value: areaQuery,
        maxLength: 100,
        onChange: (event) => setAreaQuery(event.target.value),
      })
    ),
    el(
      Field,
      { key: 'area', name: 'areaId', t },
      el(
        'select',
        {
          key: 'select',
          value: state.fields.areaId ?? '',
          'data-cv-workplace-field': 'areaId',
          onChange: (event) =>
            state.update('areaId', event.target.value || null),
        },
        [
          state.fields.areaId === null
            ? el('option', { key: 'none', value: '' }, t('cvWorkplace.empty'))
            : null,
          ...areaChoices.map((row) =>
            el(
              'option',
              { key: row.id, value: row.id },
              `${row.name} · ${row.parent}`
            )
          ),
        ]
      )
    ),
    el(
      Field,
      { key: 'industry-query', name: 'industrySearch', t },
      el('input', {
        key: 'input',
        type: 'search',
        value: industryQuery,
        maxLength: 100,
        onChange: (event) => setIndustryQuery(event.target.value),
      })
    ),
    el('fieldset', { key: 'industries', className: 'automation-fieldset' }, [
      el('legend', { key: 'legend' }, t('cvWorkplace.industryIds')),
      ...industryChoices.map((row) =>
        el('label', { key: row.id, className: 'row' }, [
          el('input', {
            key: 'box',
            type: 'checkbox',
            checked: selected.includes(row.id),
            disabled: selected.length >= 5 && !selected.includes(row.id),
            'data-cv-workplace-industry': row.id,
            onChange: (event) =>
              state.update(
                'industryIds',
                event.target.checked
                  ? [...selected, row.id].sort()
                  : selected.filter((id) => id !== row.id)
              ),
          }),
          el('span', { key: 'label' }, `${row.name} · ${row.parent}`),
        ])
      ),
    ]),
    el(
      'p',
      { key: 'bounded', className: 'meta' },
      t('cvWorkplace.boundedChoices')
    ),
  ]);
};
export const CvWorkplaceFields = ({ state, idle, t }) =>
  !state.fields
    ? null
    : el(
        'fieldset',
        {
          className: 'automation-fieldset col',
          disabled: !idle,
          'data-cv-workplace-fields': true,
        },
        [
          el('legend', { key: 'title' }, t('cvWorkplace.fields')),
          ...['company', 'position', 'description', 'website'].map((name) =>
            el(
              Field,
              { key: name, name, t },
              el(name === 'description' ? 'textarea' : 'input', {
                key: 'input',
                value: state.fields[name],
                maxLength: name === 'description' ? 24000 : 500,
                'data-cv-workplace-field': name,
                ...(name === 'description' ? { rows: 8 } : {}),
                onChange: (event) => state.update(name, event.target.value),
              })
            )
          ),
          el(
            Field,
            { key: 'current', name: 'current', t },
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: state.fields.current,
              'data-cv-workplace-field': 'current',
              onChange: (event) => {
                state.update('current', event.target.checked);
                state.update(
                  'end',
                  event.target.checked ? null : state.fields.start
                );
              },
            })
          ),
          ...['start', 'end']
            .filter((name) => name === 'start' || !state.fields.current)
            .map((name) =>
              el(
                Field,
                { key: name, name, t },
                el('input', {
                  key: 'input',
                  type: 'month',
                  min: name === 'end' ? state.fields.start : '1900-01',
                  max: '2099-12',
                  value: state.fields[name] ?? '',
                  'data-cv-workplace-field': name,
                  onChange: (event) => state.update(name, event.target.value),
                })
              )
            ),
          el(DictionaryFields, {
            key: state.source.identity.exportId + state.source.jobIndex,
            state,
            t,
          }),
        ]
      );
