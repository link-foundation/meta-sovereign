import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { PrivateCvJobState } from './private-cv-job-state.js';
import {
  formalReportRunning,
  confirmedFormalReport,
  confirmedFormalPreview,
} from '../cv/formal-report-record.js';

const el = React.createElement;
export const createFormalReportState = (api, changed, options = {}) => {
  const controller = new PrivateCvJobState(api, changed, {
    initial: { mode: 'dry-run', confirm: false },
    fields: ['mode', 'confirm'],
    prefix: 'cvFormalReport',
    pendingKey: 'meta-sovereign:formal-report',
    checked: confirmedFormalReport,
    running: formalReportRunning,
    adopt: (_state, row) => (row.options ? { mode: row.options.mode } : {}),
    ...options,
  });
  changed(controller.state);
  return controller;
};
const FormalReportProgress = ({ state }) => {
  const t = useT();
  return el(React.Fragment, null, [
    state.error
      ? el('p', { key: 'error', role: 'alert' }, t('experiencePlan.error'))
      : null,
    state.unknown
      ? el('p', { key: 'unknown', role: 'status' }, t('formalReport.unknown'))
      : null,
    state.row
      ? el(
          'p',
          {
            key: 'phase',
            role: 'status',
            'data-formal-report-state': state.row.phase,
          },
          t(`formalReport.${state.row.phase}`)
        )
      : null,
    ...(state.row?.results ?? []).map((result, index) =>
      el('p', { key: `result-${index}` }, [
        t(`formalReport.${result.state}`),
        ' ',
        result.url
          ? el(
              'a',
              {
                key: 'link',
                href: result.url,
                target: '_blank',
                rel: 'noreferrer',
              },
              result.url
            )
          : null,
      ])
    ),
    state.row?.actions.length
      ? el('details', { key: 'actions' }, [
          el('summary', { key: 'label' }, t('formalReport.actions')),
          el(
            'pre',
            {
              key: 'content',
              style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
            },
            JSON.stringify(state.row.actions, null, 2)
          ),
        ])
      : null,
  ]);
};
export const CvFormalReportScreen = ({ state, actions, preview }) => {
  const t = useT();
  const locked = state.busy || state.attempted;
  const running = formalReportRunning(state.row);
  const button = (key, onClick, disabled) =>
    el(
      'button',
      {
        key,
        type: 'button',
        onClick,
        disabled,
        'data-formal-report-action': key,
      },
      t(`formalReport.${key}`)
    );
  return el('details', { className: 'col card', 'data-formal-report': true }, [
    el('summary', { key: 'summary' }, t('formalReport.title')),
    el('p', { key: 'hint', className: 'meta' }, t('formalReport.hint')),
    el('label', { key: 'request', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('formalReport.request')),
      el('input', {
        key: 'input',
        value: state.requestId,
        disabled: locked,
        'data-formal-report-request': true,
        onChange: (event) => actions.input('requestId', event.target.value),
      }),
    ]),
    el('label', { key: 'mode', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('formalReport.mode')),
      el(
        'select',
        {
          key: 'select',
          value: state.mode,
          disabled: locked,
          'data-formal-report-mode': true,
          onChange: (event) => actions.input('mode', event.target.value),
        },
        ['dry-run', 'off', 'publish'].map((mode) =>
          el(
            'option',
            {
              key: mode,
              value: mode,
            },
            t(`formalReport.${mode}`)
          )
        )
      ),
    ]),
    preview
      ? el(
          'pre',
          {
            key: 'preview',
            'data-formal-report-preview': true,
            style: {
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: '20em',
              overflow: 'auto',
            },
          },
          JSON.stringify(preview.groups, null, 2)
        )
      : el(
          'p',
          { key: 'unavailable', role: 'status' },
          t('formalReport.previewPending')
        ),
    state.mode === 'publish'
      ? el('label', { key: 'confirm', className: 'row' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            checked: state.confirm,
            disabled: locked,
            'data-formal-report-confirm': true,
            onChange: (event) => actions.input('confirm', event.target.checked),
          }),
          el('span', { key: 'label' }, t('formalReport.confirm')),
        ])
      : null,
    el('div', { key: 'buttons', className: 'row wrap' }, [
      button(
        'start',
        () =>
          actions.mutate('Start', {
            planRequestId: preview.planRequestId,
            review: preview.fingerprint,
          }),
        locked || !preview || (state.mode === 'publish' && !state.confirm)
      ),
      button('status', () => actions.refresh(), state.busy),
      button(
        'stop',
        () => actions.mutate('Stop'),
        state.busy || (!running && !state.unknown)
      ),
      button(
        'new',
        () => {
          actions.newRequest();
          actions.input('confirm', false);
        },
        state.busy || running || state.unknown || state.row?.phase === 'unknown'
      ),
    ]),
    el(FormalReportProgress, { key: 'progress', state }),
  ]);
};
export const CvFormalReport = ({ api, planRequestId }) => {
  const [state, changed] = useState(null);
  const [preview, setPreview] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    const controller = createFormalReportState(api, changed);
    actions.current = controller;
    if (controller.state.attempted) {
      controller.refresh();
    }
    return () => controller.dispose();
  }, [api]);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    api
      .cvFormalReportPreview({ planRequestId })
      .then((answer) => confirmedFormalPreview(answer, planRequestId))
      .then((answer) => {
        if (alive) {
          actions.current?.input('confirm', false);
          setPreview(answer);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, planRequestId]);
  return state
    ? el(CvFormalReportScreen, { state, actions: actions.current, preview })
    : null;
};
