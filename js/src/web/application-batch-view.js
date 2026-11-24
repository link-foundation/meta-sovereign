import React, { useEffect, useState } from 'react';
import {
  discoveryBatchCollection,
  discoveryBatchSalary,
  discoveryBatchSettings,
  discoveryBatchUrls,
} from '../jobs/application-batch-discovery.js';
import { ApplicationAnswerReceipt } from './application-answer-settings.js';
import { ApplicationCollectionReceipt } from './application-collection-view.js';
import {
  ApplicationChatControls,
  ApplicationChatReceipt,
} from './application-chat-controls.js';

const el = React.createElement;
const chatPolicyDraft = (draft, batch, frozen) =>
  frozen && batch ? { ...draft, ...batch.settings } : draft;
const BatchHeading = ({ batch, eligible, action, selectSource, frozen, t }) =>
  el(React.Fragment, null, [
    el('h4', { key: 'title' }, t('application.batch.title')),
    el('p', { key: 'hint', className: 'meta' }, t('application.batch.hint')),
    el(ApplicationAnswerReceipt, {
      key: 'answer-context',
      receipt: batch?.settings,
    }),
    eligible.length
      ? action('use-discovery', 'discovery.useBatch', selectSource, frozen)
      : null,
  ]);

const batchDraftDefaults = {
  urls: '',
  maxApplications: 0,
  durationMs: 86400000,
  noQuestionnaires: false,
  processChats: false,
  chatsIntervalMinutes: undefined,
  chatBrowserSlot: 'chat-slot',
  chatModelDraft: false,
  chatPrefillForms: false,
  chatWatchWaiting: false,
};

export const ApplicationBatchView = ({ application, supported, t }) => {
  const state = application.batch;
  const [draft, setDraft] = useState(batchDraftDefaults);
  const [confirmed, setConfirmed] = useState(false);
  const batch = state?.receipt?.batch;
  const discovery = application.discovery?.receipt?.discovery;
  const eligible = discoveryBatchUrls(discovery);
  const slot = state?.slot;
  const selectedSource =
    draft.source?.browserSlot === slot ? draft.source : null;
  useEffect(
    () => setConfirmed(false),
    [slot, batch?.requestId, JSON.stringify(application.options)]
  );
  if (!state || !supported) {
    return null;
  }
  const frozen = state.busy || batch?.active;
  const update = (name, value) => {
    setDraft({
      ...draft,
      ...(name === 'urls' ? { source: null } : {}),
      [name]: value,
    });
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
      selectSource: () => {
        const { requestId, browserSlot } = discovery.options;
        setDraft({
          ...draft,
          source: { requestId, browserSlot },
          urls: eligible.join('\n'),
        });
        setConfirmed(false);
        application.setOptions((current) => ({
          ...current,
          ...discoveryBatchSettings(discovery),
        }));
      },
      frozen: frozen || Boolean(application.intent),
      t,
    }),
    el(BatchUrls, { key: 'urls', selectedSource, draft, frozen, update, t }),
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
        () => state.start({ ...draft, source: selectedSource }),
        batchStartDisabled(state, frozen, confirmed, draft, application)
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

const BatchUrls = ({ selectedSource, draft, frozen, update, t }) =>
  el(React.Fragment, null, [
    selectedSource ? sourceLabel(selectedSource.requestId, t, 'draft') : null,
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
  ]);

const sourceLabel = (requestId, t, location) =>
  el(
    'p',
    {
      key: 'source',
      className: 'meta',
      'data-application-batch-source': location,
      style: { overflowWrap: 'anywhere' },
    },
    t('discovery.batchSource', { requestId })
  );

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
      batch.discoveryRequestId
        ? sourceLabel(batch.discoveryRequestId, t, 'receipt')
        : null,
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
      el(ApplicationCollectionReceipt, {
        key: 'collection',
        receipt: batch.settings,
        t,
      }),
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
      el(ApplicationChatReceipt, {
        key: 'chats',
        worker: batch.chatWorker,
        watchWaiting: batch.settings.chatWatchWaiting,
        skip: state.skipChat,
        disabled: state.busy || !batch.active,
        t,
      }),
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
  Boolean(draft.source && draft.source.browserSlot !== state.slot) ||
  application.occupied ||
  Boolean(application.options.formUrl) ||
  application.discoveryRunning;

export const discoveredReviewUrls = (state) =>
  discoveryBatchUrls(state?.receipt?.discovery);
export const discoveredSalarySettings = (state) =>
  discoveryBatchSalary(state?.receipt?.discovery);
export const discoveredCollectionSettings = (state) =>
  discoveryBatchCollection(state?.receipt?.discovery);
export const discoveredApplicationSettings = (state) =>
  discoveryBatchSettings(state?.receipt?.discovery);
