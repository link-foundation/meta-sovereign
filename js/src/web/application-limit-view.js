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
export const ApplicationLimitWaitControls = ({
  application,
  confirmed,
  idle,
  t,
}) => {
  const receipt = application.receipt;
  const wait = receipt?.limitWait;
  const active = wait && ['waiting', 'refreshing'].includes(wait.phase);
  const ready = idle && application.known && receipt?.active;
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
        el(
          'button',
          {
            key: 'action',
            type: 'button',
            'data-application-action': active
              ? 'stop-limit-wait'
              : 'wait-limit',
            disabled: active
              ? !ready
              : !ready || !canStartWait(receipt, confirmed),
            onClick: () =>
              application.action(
                'Wait',
                active
                  ? { action: 'stop', waitId: wait.id }
                  : {
                      action: 'start',
                      confirm: true,
                      waitId: globalThis.crypto.randomUUID(),
                    }
              ),
          },
          t(active ? 'application.limitWaitStop' : 'application.limitWaitStart')
        ),
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
