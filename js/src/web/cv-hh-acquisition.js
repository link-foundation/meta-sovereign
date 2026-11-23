import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { PrivateCvJobState } from './private-cv-job-state.js';

const el = React.createElement;
const running = (row) => ['checking-cache', 'exporting'].includes(row?.phase);
const checked = (row, requestId) => {
  if (
    row?.requestId !== requestId ||
    ![
      'checking-cache',
      'exporting',
      'completed',
      'stopped',
      'failed',
      'interrupted',
    ].includes(row.phase) ||
    (row.phase === 'completed' &&
      (!/^[a-f0-9]{64}$/u.test(row.result?.revision ?? '') ||
        !['cached', 'native'].includes(row.result?.source)))
  ) {
    throw new Error('The HeadHunter export state was not acknowledged.');
  }
  return row;
};
export const createHhAcquisitionState = (api, changed, options = {}) => {
  const current = new PrivateCvJobState(api, changed, {
    initial: { hash: '', browserSlot: 'jobs' },
    fields: ['hash', 'browserSlot'],
    prefix: 'cvHhAcquisition',
    checked,
    running,
    pendingKey: 'ms.cv.hh-acquisition',
    adopt: (_state, row) =>
      row.options
        ? { hash: row.options.hash ?? '', browserSlot: row.options.browserSlot }
        : {},
    ...options,
  });
  // The form sends an optional hash in Start. Blank selects the latest available resume.
  changed(current.state);
  if (current.state.unknown) {
    void current.refresh();
  }
  return current;
};

const HhAcquisitionScreen = ({ state, actions, select, selecting }) => {
  const t = useT();
  const locked = state.busy || state.attempted;
  const active = running(state.row);
  const valid =
    /^[a-zA-Z0-9_-]{1,100}$/u.test(state.requestId) &&
    (state.hash === '' || /^[a-zA-Z0-9_-]{1,100}$/u.test(state.hash)) &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(state.browserSlot);
  const button = (id, onClick, disabled) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        'data-hh-acquisition-action': id,
        onClick,
        disabled,
      },
      t(`hhAcquisition.${id}`)
    );
  const field = (name) =>
    el('label', { key: name, className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t(`hhAcquisition.${name}`)),
      el('input', {
        key: 'input',
        value: state[name],
        disabled: locked,
        maxLength: 100,
        'data-hh-acquisition-field': name,
        onChange: (event) => actions.input(name, event.target.value.trim()),
      }),
    ]);
  const start = (refresh) =>
    actions.mutate('Start', { hash: state.hash || null, refresh });
  const phase =
    state.row?.phase === 'completed'
      ? state.row.result.source
      : state.row?.phase;
  return el('details', { className: 'col', 'data-hh-acquisition': true }, [
    el('summary', { key: 'title' }, t('hhAcquisition.title')),
    el('p', { key: 'hint', className: 'meta' }, t('hhAcquisition.hint')),
    field('hash'),
    field('browserSlot'),
    field('requestId'),
    el('div', { key: 'actions', className: 'row wrap' }, [
      button('start', () => start(false), locked || !valid),
      button('refresh', () => start(true), locked || !valid),
      button('status', () => actions.refresh(), state.busy || !state.requestId),
      button(
        'stop',
        () => actions.mutate('Stop'),
        state.busy || (!active && !state.unknown)
      ),
      button(
        'new',
        () => actions.newRequest(),
        state.busy || active || state.unknown
      ),
    ]),
    phase
      ? el(
          'p',
          { key: 'phase', role: 'status', 'data-hh-acquisition-phase': phase },
          t(`hhAcquisition.phase.${phase}`)
        )
      : null,
    state.unknown
      ? el('p', { key: 'unknown', role: 'status' }, t('hhAcquisition.unknown'))
      : null,
    state.error
      ? el('p', { key: 'error', role: 'alert' }, t('hhAcquisition.error'))
      : null,
    !state.unknown && state.row?.phase === 'completed'
      ? button('select', () => select(state.row.result.revision), selecting)
      : null,
  ]);
};
export const CvHhAcquisition = ({ api, select, selecting }) => {
  const [state, setState] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    const current = createHhAcquisitionState(api, setState);
    actions.current = current;
    return () => current.dispose();
  }, [api]);
  return state
    ? el(HhAcquisitionScreen, {
        state,
        actions: actions.current,
        select,
        selecting,
      })
    : null;
};
