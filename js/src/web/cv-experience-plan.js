import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';
import {
  createExperiencePlanState,
  downloadExperiencePlan,
} from './cv-experience-plan-state.js';
import { experiencePlanRunning } from '../cv/experience-plan-record.js';
import { LINO_TEXT, LINO_BINARY } from '../transport/lino.js';
import { CvExperiencePlanView } from './cv-experience-plan-view.js';
import { CvFormalReport } from './cv-formal-report.js';

const el = React.createElement;
const PlanProgress = ({ state }) => {
  const t = useT();
  return el(React.Fragment, null, [
    state.busy || experiencePlanRunning(state.row)
      ? el(Busy, { key: 'busy' }, t('experiencePlan.working'))
      : null,
    state.error
      ? el('p', { key: 'error', role: 'alert' }, t('experiencePlan.error'))
      : null,
    state.unknown
      ? el('p', { key: 'unknown', role: 'status' }, t('experiencePlan.unknown'))
      : null,
    state.row
      ? el(
          'p',
          {
            key: 'state',
            role: 'status',
            'data-experience-plan-state': state.row.phase,
          },
          t(`experiencePlan.${state.row.phase}`)
        )
      : null,
  ]);
};
export const CvExperiencePlanScreen = ({ state, actions, choices }) => {
  const t = useT();
  const locked = state.busy || state.attempted;
  const running = experiencePlanRunning(state.row);
  const button = (operation, action, disabled) =>
    el(
      'button',
      {
        key: operation,
        type: 'button',
        onClick: action,
        disabled,
        'data-experience-plan-action': operation,
      },
      t(`experiencePlan.${operation}`)
    );
  return el('section', { className: 'col', 'data-experience-plan': true }, [
    el('h3', { key: 'title' }, t('experiencePlan.title')),
    el('p', { key: 'hint', className: 'meta' }, t('experiencePlan.hint')),
    el('label', { key: 'direction', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('experiencePlan.direction')),
      el(
        'select',
        {
          key: 'select',
          value: state.to,
          disabled: locked,
          'data-experience-plan-to': true,
          onChange: (event) => actions.input('to', event.target.value),
        },
        ['linkedin', 'hh'].map((platform) =>
          el(
            'option',
            { key: platform, value: platform },
            platform === 'linkedin' ? 'HH → LinkedIn' : 'LinkedIn → HH'
          )
        )
      ),
    ]),
    el('label', { key: 'request', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('experiencePlan.request')),
      el('input', {
        key: 'input',
        value: state.requestId,
        disabled: locked,
        'data-experience-plan-request': true,
        onChange: (event) => actions.input('requestId', event.target.value),
      }),
    ]),
    el('div', { key: 'controls', className: 'row wrap' }, [
      button(
        'start',
        () => actions.mutate('Start', { ...choices }),
        locked || !choices.hh || !choices.linkedin
      ),
      button('status', () => actions.refresh(), state.busy),
      button(
        'stop',
        () => actions.mutate('Stop'),
        state.busy || (!running && !state.unknown)
      ),
      button(
        'new',
        () => actions.newRequest(),
        state.busy || running || state.unknown
      ),
    ]),
    el(PlanProgress, { key: 'progress', state }),
    state.row
      ? el(CvExperiencePlanView, { key: 'result', row: state.row })
      : null,
    state.row?.plan
      ? el(
          'div',
          { key: 'download', className: 'row wrap' },
          [
            [LINO_TEXT, 'text'],
            [LINO_BINARY, 'binary'],
          ].map(([type, key]) =>
            button(
              key,
              () => downloadExperiencePlan(state.row, type),
              state.busy
            )
          )
        )
      : null,
    state.row?.phase === 'completed'
      ? el(CvFormalReport, {
          key: 'reports',
          api: actions.api,
          planRequestId: state.row.requestId,
        })
      : null,
  ]);
};
export const CvExperiencePlan = ({ api, choices }) => {
  const [state, changed] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    const controller = createExperiencePlanState(api, changed, {
      adopt: (_state, row) => (row.options ? { to: row.options.to } : {}),
    });
    actions.current = controller;
    if (controller.state.attempted) {
      controller.refresh();
    }
    return () => controller.dispose();
  }, [api]);
  return state
    ? el(CvExperiencePlanScreen, { state, actions: actions.current, choices })
    : null;
};
