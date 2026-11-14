import React, { useState } from 'react';

const el = React.createElement;
const button = (name, callback, disabled, t) =>
  el(
    'button',
    {
      key: name,
      type: 'button',
      'data-discovery-action': name,
      disabled,
      onClick: () => {
        void Promise.resolve()
          .then(callback)
          .catch(() => {});
      },
    },
    t(`discovery.${name}`)
  );

export const VacancyDiscoveryView = ({ state, t }) => {
  const [bounds, setBounds] = useState({
    maxPages: 10,
    maxVacancies: 100,
    durationMs: 900000,
    refresh: false,
  });
  const discovery = state.discovery;
  const job = discovery?.receipt?.discovery;
  if (!discovery || (state.capabilities?.discovery !== true && !job)) {
    return null;
  }
  const valid = [
    [bounds.maxPages, 100],
    [bounds.maxVacancies, 1000],
    [bounds.durationMs / 1000, 86400],
  ].every(
    ([value, max]) => Number.isInteger(value) && value >= 1 && value <= max
  );
  const frozen = discovery.busy || job?.phase === 'running';
  return el('section', { className: 'col', 'data-vacancy-discovery': true }, [
    el('h3', { key: 'title' }, t('discovery.title')),
    el('p', { key: 'hint', className: 'meta' }, t('discovery.hint')),
    el(DiscoveryBounds, { key: 'bounds', frozen, bounds, setBounds, t }),
    el('div', { key: 'actions', className: 'row' }, [
      button(
        'start',
        () => discovery.start(bounds),
        discoveryStartDisabled(state, frozen, valid),
        t
      ),
      button('status', discovery.refresh, discovery.busy, t),
      button(
        'stop',
        discovery.stop,
        discovery.busy || job?.phase !== 'running',
        t
      ),
    ]),
    discovery.error
      ? el(
          'p',
          { key: 'error', role: 'alert' },
          `${t('vacancy.failed')} (${discovery.error})`
        )
      : null,
    job ? el(DiscoveryReceipt, { key: 'receipt', job, t }) : null,
  ]);
};

const DiscoveryBounds = ({ frozen, bounds, setBounds, t }) =>
  el(
    'fieldset',
    { key: 'bounds', disabled: frozen, className: 'automation-fieldset' },
    [
      el('legend', { key: 'legend' }, t('discovery.bounds')),
      ...[
        ['maxPages', 100, bounds.maxPages],
        ['maxVacancies', 1000, bounds.maxVacancies],
        ['durationMs', 86400, bounds.durationMs / 1000],
      ].map(([name, max, value]) =>
        el('label', { key: name, className: 'col' }, [
          t(`discovery.${name}`),
          el('input', {
            key: 'input',
            type: 'number',
            min: 1,
            max,
            step: 1,
            value,
            'data-discovery-field': name,
            onChange: (event) =>
              setBounds({
                ...bounds,
                [name]:
                  Number(event.target.value) *
                  (name === 'durationMs' ? 1000 : 1),
              }),
          }),
        ])
      ),
      el('label', { key: 'refresh', className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: bounds.refresh,
          'data-discovery-field': 'refresh',
          onChange: (event) =>
            setBounds({ ...bounds, refresh: event.target.checked }),
        }),
        t('discovery.refresh'),
      ]),
    ]
  );

const DiscoveryReceipt = ({ job, t }) =>
  el(
    'div',
    {
      key: 'receipt',
      className: 'col',
      role: 'status',
      'data-discovery-phase': job.phase,
    },
    [
      el('p', { key: 'phase' }, t(`discovery.phase.${job.phase}`)),
      el(
        'p',
        { key: 'progress' },
        t('discovery.progress', {
          pages: job.pages,
          count: job.entries.length,
          duplicates: job.duplicates,
        })
      ),
      job.reason
        ? el('p', { key: 'reason' }, t(`discovery.reason.${job.reason}`))
        : null,
      job.code ? el('p', { key: 'code' }, job.code) : null,
      el(
        'p',
        {
          key: 'source',
          className: 'meta',
          style: { overflowWrap: 'anywhere' },
        },
        t('discovery.source', {
          query: job.options.search.query || '—',
          resume: job.options.search.resume || '—',
          pages: job.options.maxPages,
          maximum: job.options.maxVacancies,
        })
      ),
      ...job.entries.map((row) =>
        el(
          'article',
          {
            key: row.card.url,
            className: 'col',
            'data-discovery-card': row.card.url,
          },
          [
            el(
              'a',
              {
                key: 'title',
                href: row.card.url,
                target: '_blank',
                rel: 'noreferrer',
              },
              row.card.title
            ),
            el(
              'span',
              { key: 'reason' },
              t(`vacancySelection.${row.decision.reason}`)
            ),
            row.capturedAt
              ? el(
                  'span',
                  { key: 'date', className: 'meta' },
                  t('vacancySelection.cachedAt', { date: row.capturedAt })
                )
              : null,
          ]
        )
      ),
    ]
  );

const discoveryStartDisabled = (state, frozen, valid) =>
  frozen ||
  !valid ||
  !state.discovery.known ||
  Boolean(state.busy) ||
  !state.valid ||
  state.capabilities?.discovery !== true;
