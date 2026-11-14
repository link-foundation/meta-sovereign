import React from 'react';

const el = React.createElement;
const canStartWait = (receipt, confirmed) =>
  confirmed &&
  receipt.applicationLimit.active &&
  receipt.applicationLimit.saved &&
  receipt.draft?.limit &&
  !receipt.paused &&
  !receipt.noQuestionnaires &&
  !receipt.testMode &&
  !receipt.page?.challenge;
const canRestoreWait = (receipt, confirmed) =>
  canStartWait(receipt, confirmed) &&
  !receipt.attempted.submit &&
  receipt.delivery === 'none';

const WaitAction = ({
  active,
  ready,
  receipt,
  confirmed,
  application,
  start,
  wait,
  t,
}) =>
  el(
    'button',
    {
      type: 'button',
      'data-application-action': active ? 'stop-limit-wait' : 'wait-limit',
      disabled: active ? !ready : !ready || !canStartWait(receipt, confirmed),
      onClick: () =>
        active
          ? application.action('Wait', { action: 'stop', waitId: wait.id })
          : start(false),
    },
    t(active ? 'application.limitWaitStop' : 'application.limitWaitStart')
  );
export const ApplicationLimitWaitControls = ({
  application,
  confirmed,
  idle,
  t,
}) => {
  const receipt = application.receipt;
  const wait = receipt?.limitWait;
  const active =
    wait && ['waiting', 'refreshing', 'restoring'].includes(wait.phase);
  const ready = idle && application.known && receipt?.active;
  const start = (restoreDraft) =>
    application.action('Wait', {
      action: 'start',
      confirm: true,
      waitId: globalThis.crypto.randomUUID(),
      restoreDraft,
    });
  return receipt?.applicationLimit
    ? el('div', { className: 'col' }, [
        el(
          'p',
          { key: 'hint', className: 'meta' },
          t('application.limitWaitHint')
        ),
        wait
          ? el(
              'p',
              {
                key: 'status',
                role: 'status',
                'data-application-limit-wait': wait.phase,
              },
              [
                t(`application.limitWait.${wait.phase}`),
                wait.code ? ` (${wait.code})` : '',
              ]
            )
          : null,
        wait?.restoreDraft
          ? el(
              'p',
              {
                key: 'restore-policy',
                className: 'meta',
                'data-application-limit-restore': true,
              },
              t('application.limitWaitRestorePolicy')
            )
          : null,
        el(WaitAction, {
          key: 'action',
          active,
          ready,
          receipt,
          confirmed,
          application,
          start,
          wait,
          t,
        }),
        !active
          ? el(
              'button',
              {
                key: 'restore-action',
                type: 'button',
                'data-application-action': 'wait-limit-restore',
                disabled: !ready || !canRestoreWait(receipt, confirmed),
                onClick: () => start(true),
              },
              t('application.limitWaitRestore')
            )
          : null,
      ])
    : null;
};
export const ApplicationLimitView = ({ application, t }) => {
  const limit =
    application.queue?.applicationLimit ??
    application.receipt?.applicationLimit;
  return limit
    ? el(
        'div',
        {
          className: 'col',
          'data-application-limit': limit.active ? 'waiting' : 'elapsed',
          role: 'status',
        },
        [
          el(
            'p',
            { key: 'deadline', 'data-application-limit-until': limit.until },
            t(
              limit.active
                ? 'application.limitWaiting'
                : 'application.limitElapsed',
              { at: limit.until }
            )
          ),
          el(
            'p',
            { key: 'scope', className: 'meta' },
            t('application.limitScope')
          ),
          !limit.saved
            ? el(
                'p',
                { key: 'unsaved', role: 'alert' },
                t('application.limitUnsaved')
              )
            : null,
        ]
      )
    : null;
};
