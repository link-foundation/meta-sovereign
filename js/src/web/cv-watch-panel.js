import React, { useState } from 'react';

const el = React.createElement;
export const CvSaveWatch = ({ state, t }) => {
  const {
    watch,
    snapshots,
    loadError,
    duration,
    setDuration,
    start,
    stop,
    reload,
  } = state.cvSaveWatch;
  const [chosen, setChosen] = useState('');
  const snapshot = snapshots.find((row) => row.hash === chosen) ?? snapshots[0];
  const idle = !state.busy;
  const active = watch?.active === true;
  const status = watch?.state ?? 'none';
  const button = (id, callback, disabled) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        onClick: callback,
        disabled,
        'data-cv-watch-action': id,
      },
      t(`cvWatch.${id}`)
    );
  return el(
    'section',
    {
      className: 'col',
      'data-cv-save-watch': true,
      'aria-label': t('cvWatch.title'),
    },
    [
      el('h3', { key: 'title' }, t('cvWatch.title')),
      el('p', { key: 'hint', className: 'meta' }, t('cvWatch.hint')),
      el('label', { key: 'duration', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('cvWatch.duration')),
        el(
          'select',
          {
            key: 'input',
            value: duration,
            disabled: !idle || active,
            onChange: (event) => setDuration(event.target.value),
            'data-cv-watch-duration': true,
          },
          [1, 5, 15, 30, 60, 120].map((value) =>
            el('option', { key: value, value }, String(value))
          )
        ),
      ]),
      el('div', { key: 'actions', className: 'row' }, [
        button(
          'start',
          start,
          !idle ||
            active ||
            loadError ||
            state.capabilities?.cvSaveWatch !== true
        ),
        button('stop', stop, !idle || !active),
        button('reload', reload, !idle),
      ]),
      el(
        'p',
        {
          key: 'state',
          role: 'status',
          'data-cv-watch-state': status,
        },
        t(`cvWatch.${status}`)
      ),
      watch
        ? el(
            'p',
            { key: 'receipt', className: 'meta' },
            `${t('cvWatch.verified')}: ${watch.saves} · ${t('cvWatch.until')}: ${watch.expiresAt}`
          )
        : null,
      loadError
        ? el('p', { key: 'error', role: 'status' }, t('cvWatch.loadError'))
        : null,
      el('h4', { key: 'saved' }, t('cvWatch.snapshots')),
      snapshot
        ? el(React.Fragment, { key: 'snapshot' }, [
            el('label', { key: 'choice', className: 'chat-form-field' }, [
              el('span', { key: 'label' }, t('cvWatch.choose')),
              el(
                'select',
                {
                  key: 'select',
                  value: snapshot.hash,
                  onChange: (event) => setChosen(event.target.value),
                },
                snapshots.map((row) =>
                  el(
                    'option',
                    { key: row.hash, value: row.hash },
                    `${row.cv.title} · ${row.cv.language} · ${row.hash}`
                  )
                )
              ),
            ]),
            el(
              'p',
              {
                key: 'evidence',
                className: 'meta',
                style: { overflowWrap: 'anywhere' },
              },
              `${t('cvWatch.native')}: ${snapshot.savedAt} · ${snapshot.sha256}`
            ),
            el(
              'details',
              { key: snapshot.sha256, 'data-cv-saved-snapshot': snapshot.hash },
              [
                el('summary', { key: 'summary' }, t('cvWatch.inspect')),
                el(
                  'pre',
                  {
                    key: 'data',
                    style: {
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      fontFamily: 'inherit',
                    },
                  },
                  JSON.stringify(snapshot.cv, null, 2)
                ),
              ]
            ),
          ])
        : el('p', { key: 'empty', className: 'meta' }, t('cvWatch.empty')),
    ]
  );
};
