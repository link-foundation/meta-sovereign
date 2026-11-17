import React, { useEffect, useState } from 'react';
import { salaryTierFloor } from '../jobs/salary-ladder.js';
import { ApplicationAnswerReceipt } from './application-answer-settings.js';
import {
  ApplicationChatControls,
  ApplicationChatReceipt,
} from './application-chat-controls.js';

const el = React.createElement;
const chatPolicyDraft = (draft, batch, frozen) =>
  frozen && batch ? { ...draft, ...batch.settings } : draft;
const BatchHeading = ({ batch, eligible, action, copy, frozen, t }) =>
  el(React.Fragment, null, [
    el('h4', { key: 'title' }, t('application.batch.title')),
    el('p', { key: 'hint', className: 'meta' }, t('application.batch.hint')),
    el(ApplicationAnswerReceipt, {
      key: 'answer-context',
      receipt: batch?.settings,
    }),
    eligible.length
      ? action('use-discovery', 'discovery.useBatch', copy, frozen)
      : null,
  ]);

export const ApplicationBatchView = ({ application, supported, t }) => {
  const state = application.batch;
  const [draft, setDraft] = useState({
    urls: '',
    maxApplications: 0,
    durationMs: 86400000,
    noQuestionnaires: false,
    processChats: false,
    chatsIntervalMinutes: 120,
    chatBrowserSlot: 'chat-slot',
    chatModelDraft: false,
  });
  const [confirmed, setConfirmed] = useState(false);
  const batch = state?.receipt?.batch;
  const eligible = discoveredReviewUrls(application.discovery);
  useEffect(
    () => setConfirmed(false),
    [batch?.requestId, JSON.stringify(application.options)]
  );
  if (!state || !supported) {
    return null;
  }
  const frozen = state.busy || batch?.active;
  const startDisabled = batchStartDisabled(
    state,
    frozen,
    confirmed,
    draft,
    application
  );
  const update = (name, value) => {
    setDraft({ ...draft, [name]: value });
    setConfirmed(false);
  };
  const action = (...args) => batchAction(t, ...args);
  const check = (...args) => batchCheck(t, ...args);
  return el('div', { className: 'col', 'data-application-batch': true }, [
    el(BatchHeading, {
      key: 'heading',
      batch,
      eligible,
      action,
      copy: () => {
        update('urls', eligible.join('\n'));
        application.setOptions((current) => ({
          ...current,
          ...discoveredSalarySettings(application.discovery),
        }));
      },
      frozen: frozen || Boolean(application.intent),
      t,
    }),
    el('label', { key: 'urls', className: 'col' }, [
      t('application.batch.urls'),
      el('textarea', {
        key: 'input',
        value: draft.urls,
        rows: 3,
        disabled: frozen,
        'data-application-batch-field': 'urls',
        onChange: (event) => update('urls', event.target.value),
      }),
    ]),
    ...[
      [
        'maxApplications',
        'application.batch.maximum',
        0,
        1000,
        draft.maxApplications,
      ],
      [
        'durationMs',
        'application.batch.duration',
        1,
        86400,
        draft.durationMs / 1000,
      ],
    ].map(([name, label, min, max, value]) =>
      el('label', { key: name, className: 'col' }, [
        t(label),
        el('input', {
          key: 'input',
          type: 'number',
          min,
          max,
          step: 1,
          value,
          disabled: frozen,
          'data-application-batch-field': name,
          onChange: (event) =>
            update(
              name,
              Number(event.target.value) * (name === 'durationMs' ? 1000 : 1)
            ),
        }),
      ])
    ),
    check(
      'noQuestionnaires',
      'application.noQuestionnaires',
      draft.noQuestionnaires,
      (value) => update('noQuestionnaires', value),
      frozen
    ),
    check(
      'confirmBatch',
      'application.batch.confirm',
      confirmed,
      setConfirmed,
      frozen
    ),
    el(ApplicationChatControls, {
      key: 'chats',
      draft: chatPolicyDraft(draft, batch, frozen),
      update,
      frozen,
      t,
    }),
    el('div', { key: 'actions', className: 'row' }, [
      action(
        'start',
        'application.batch.start',
        () => state.start(draft),
        startDisabled
      ),
      action('status', 'application.batch.status', state.refresh, state.busy),
      action(
        'stop',
        'application.batch.stop',
        state.stop,
        state.busy || !batch?.active
      ),
      action(
        'follow',
        'application.batch.follow',
        state.follow,
        state.busy || !state.receipt?.application
      ),
    ]),
    state.error
      ? el(
          'p',
          { key: 'error', role: 'alert' },
          `${t('application.failed')} (${state.error})`
        )
      : null,
    batch ? el(BatchReceipt, { key: 'receipt', batch, state, t, check }) : null,
  ]);
};

const BatchReceipt = ({ batch, state, t, check }) =>
  el(
    'div',
    {
      key: 'receipt',
      className: 'col',
      role: 'status',
      'data-application-batch-phase': batch.phase,
    },
    [
      el('p', { key: 'phase' }, t(`application.batch.phase.${batch.phase}`)),
      el(
        'p',
        { key: 'progress' },
        t('application.batch.progress', {
          delivered: batch.delivered,
          skipped: batch.skipped,
          total: batch.total,
        })
      ),
      batch.salaryTier === undefined
        ? null
        : el('p', { key: 'salary', 'data-application-batch-salary': true }, [
            t('discovery.salaryTier', {
              tier: batch.salaryTier + 1,
              floor: batch.salaryFloorRub,
            }),
            ' · ',
            t('application.batch.salaryDeferred', {
              count: batch.salaryDeferred,
            }),
          ]),
      el(
        'p',
        {
          key: 'settings',
          className: 'meta',
          'data-application-batch-settings': true,
        },
        t('application.batch.settings', {
          steps: batch.settings.confirmations.length
            ? batch.settings.confirmations
                .map((step) => t(`application.confirmation.${step}`))
                .join(', ')
            : t('application.confirmation.none'),
          interval:
            batch.settings.applicationIntervalSeconds === 0
              ? t('application.pacingMode.adaptive')
              : `${batch.settings.applicationIntervalSeconds}s`,
          maximum: batch.maxApplications || batch.total,
        })
      ),
      batch.currentUrl
        ? el(
            'p',
            {
              key: 'current',
              'data-application-batch-current': true,
              className: 'meta',
              style: { overflowWrap: 'anywhere' },
            },
            batch.currentUrl
          )
        : null,
      batch.nextAt
        ? el(
            'p',
            { key: 'next' },
            t('application.batch.next', { at: batch.nextAt })
          )
        : null,
      batch.code ? el('p', { key: 'code' }, batch.code) : null,
      el(ApplicationChatReceipt, { key: 'chats', worker: batch.chatWorker, t }),
      check(
        'batchPaused',
        'application.pause',
        batch.paused,
        (paused) => {
          void state.mode({ paused }).catch(() => {});
        },
        state.busy || !batch.active
      ),
      check(
        'batchQuestionnaires',
        'application.noQuestionnaires',
        batch.noQuestionnaires,
        (noQuestionnaires) => {
          void state.mode({ noQuestionnaires }).catch(() => {});
        },
        state.busy || !batch.active
      ),
    ]
  );

const batchAction = (t, key, label, callback, disabled) =>
  el(
    'button',
    {
      key,
      type: 'button',
      'data-application-batch-action': key,
      disabled,
      onClick: () => {
        void Promise.resolve()
          .then(callback)
          .catch(() => {});
      },
    },
    t(label)
  );
const batchCheck = (t, key, label, checked, onChange, disabled) =>
  el('label', { key, className: 'row' }, [
    el('input', {
      key: 'input',
      type: 'checkbox',
      checked,
      disabled,
      'data-application-batch-field': key,
      onChange: (event) => onChange(event.target.checked),
    }),
    t(label),
  ]);

const batchStartDisabled = (state, frozen, confirmed, draft, application) =>
  frozen ||
  !state.known ||
  !confirmed ||
  !draft.urls.trim() ||
  application.occupied ||
  Boolean(application.options.formUrl) ||
  application.discoveryRunning;

export const discoveredReviewUrls = (state) => {
  const discovery = state?.receipt?.discovery;
  return discovery?.phase === 'completed'
    ? discovery.entries
        .filter(
          (row) =>
            row.decision.reason === 'review' &&
            (!row.pay || row.pay.action === 'apply')
        )
        .map((row) => row.card.url)
    : [];
};

export const discoveredSalarySettings = (state) => {
  const discovery = state?.receipt?.discovery;
  const options = discovery?.options;
  const floor = options ? salaryTierFloor(options, discovery.salaryTier) : null;
  return discovery?.phase === 'completed' && options.salaryConfig
    ? {
        salary: options.salaryConfig,
        salaryLadder: options.salaryLadder !== false,
        ...(floor === null ? {} : { salaryFloorRub: floor }),
      }
    : {};
};
