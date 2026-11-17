import React from 'react';
import { useWorkspaceJob } from './workspace-job-state.js';

const el = React.createElement;
const cannotOpen = (state, control, login) =>
  !control.known ||
  control.busy ||
  !!state.busy ||
  !state.browserValid ||
  login?.active === true ||
  state.capabilities?.manualLogin !== true;
export const useJobLogin = ({ api, values, remember }) => {
  const state = useWorkspaceJob({
    api,
    slot: values.browserSlot,
    prefix: 'vacancyLogin',
    member: 'login',
  });
  const act = (name, input) => {
    void state.execute(name, input).catch(() => {});
  };
  return {
    ...state,
    start: () => {
      remember?.(values);
      act('Open', {
        browserSlot: values.browserSlot,
        requestId: globalThis.crypto.randomUUID(),
        ...(values.mode === 'inherit'
          ? {}
          : { headless: values.mode === 'headless' }),
      });
    },
    close: () =>
      act('Close', {
        browserSlot: values.browserSlot,
        ...(state.receipt?.login?.requestId
          ? { requestId: state.receipt.login.requestId }
          : {}),
      }),
    reload: () => {
      void state.refresh().catch(() => {});
    },
  };
};
export const JobLoginPanel = ({ state, t }) => {
  const control = state.jobLogin;
  if (
    !control ||
    (state.capabilities?.manualLogin !== true && !control.receipt?.login)
  ) {
    return null;
  }
  const login = control.receipt?.login;
  const button = (key, action, disabled) =>
    el(
      'button',
      {
        key,
        type: 'button',
        onClick: action,
        disabled,
        'data-job-login-action': key,
      },
      t(`jobLogin.${key}`)
    );
  const status = control.known ? (login?.state ?? 'none') : 'unknown';
  return el(
    'section',
    {
      className: 'col',
      'data-job-login': true,
      'aria-label': t('jobLogin.title'),
    },
    [
      el('h3', { key: 'title' }, t('jobLogin.title')),
      el('p', { key: 'hint', className: 'meta' }, t('jobLogin.hint')),
      el('div', { key: 'actions', className: 'row' }, [
        button('open', control.start, cannotOpen(state, control, login)),
        button('close', control.close, control.busy || login?.active !== true),
        button('reload', control.reload, control.busy),
      ]),
      el(
        'p',
        { key: 'state', role: 'status', 'data-job-login-state': status },
        t(`jobLogin.${status}`)
      ),
      control.error
        ? el(
            'p',
            { key: 'error', role: 'alert' },
            t(
              control.error === 'jobs-login-visible'
                ? 'jobLogin.visible'
                : 'jobLogin.error'
            )
          )
        : null,
    ]
  );
};
