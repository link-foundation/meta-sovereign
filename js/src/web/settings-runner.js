import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { canRunnerAction, followRunnerSessions } from './runner-view-state.js';

const el = React.createElement;
const noticeKey = (code) =>
  ({
    'runner-profile-change-blocked': 'profileChanged',
    'runner-profile-unavailable': 'profileUnavailable',
    'runner-unconfigured': 'unconfigured',
  })[code] ?? 'actionNotConfirmed';

const RunnerMode = ({ mode, state, act }) => {
  const t = useT();
  const observed = state.answer?.states[mode] ?? 'loading';
  return el('div', { className: 'col', 'data-runner-mode': mode }, [
    el('h4', { key: 'title' }, t(`runner.${mode}`)),
    el(
      'p',
      { key: 'state', role: 'status', 'data-runner-state': observed },
      t(`runner.${observed}`)
    ),
    el(
      'div',
      {
        key: 'actions',
        className: 'row',
        style: { flexWrap: 'wrap', gap: 'var(--gap, 12px)' },
      },
      ['start', 'stop'].map((action) =>
        el(
          'button',
          {
            key: action,
            type: 'button',
            'data-runner-action': action,
            disabled: !canRunnerAction(state, action, mode),
            onClick: () => void act(action, mode),
          },
          t(`runner.${action}`)
        )
      )
    ),
  ]);
};

const RunnerControls = ({ api }) => {
  const t = useT();
  const [state, setState] = useState({ answer: null, busy: true });
  const owner = useRef(null);
  useEffect(() => {
    const control = followRunnerSessions({
      request: api.runnerRequest,
      update: setState,
    });
    owner.current = control;
    return control.close;
  }, [api]);
  const notice = state.answer?.code ?? state.notice;
  return el('div', { className: 'col', 'aria-busy': state.busy }, [
    el('p', { key: 'scope', className: 'meta' }, t('runner.scope')),
    state.error
      ? el('p', { key: 'error', role: 'alert' }, t('runner.unavailable'))
      : null,
    state.busy
      ? el('p', { key: 'pending', role: 'status' }, t('runner.checking'))
      : null,
    notice
      ? el(
          'p',
          { key: 'notice', role: 'status' },
          t(`runner.${noticeKey(notice)}`)
        )
      : null,
    ...['local', 'server'].map((mode) =>
      el(RunnerMode, {
        key: mode,
        mode,
        state,
        act: (action, target) => owner.current?.act(action, target),
      })
    ),
    el(
      'button',
      {
        key: 'refresh',
        type: 'button',
        disabled: state.busy,
        'data-runner-action': 'refresh',
        onClick: () => void owner.current?.refresh(),
      },
      t('runner.refresh')
    ),
  ]);
};

export const RunnerSettings = ({ api }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return el('section', { className: 'card col', 'data-runner-settings': '' }, [
    el('h3', { key: 'title' }, t('runner.title')),
    el('p', { key: 'hint', className: 'meta' }, t('runner.hint')),
    el(
      'details',
      {
        key: 'details',
        onToggle: (event) => setOpen(event.currentTarget.open),
      },
      [
        el(
          'summary',
          { key: 'summary', 'data-runner-open': '' },
          t('runner.show')
        ),
        open ? el(RunnerControls, { key: 'controls', api }) : null,
      ]
    ),
  ]);
};
