import React, { useEffect, useState } from 'react';
import { ApplicationDraftView } from './application-draft-view.js';
import { FormInspectionReport } from './forms-view.js';
import { applicationMayRestart } from './application-session.js';
import { ApplicationQueueView } from './application-queue-view.js';
import { ApplicationResumeView } from './application-resume-view.js';
import { ApplicationLetterSettings } from './application-letter-settings.js';
import {
  ApplicationLimitView,
  ApplicationLimitWaitControls,
} from './application-limit-view.js';
import { applicationLimitHeld } from '../jobs/application-limit-data.js';

const el = React.createElement;
const button = (key, label, onClick, disabled) =>
  el(
    'button',
    {
      key,
      type: 'button',
      'data-application-action': key,
      onClick,
      disabled,
    },
    label
  );
const check = (key, label, checked, onChange, disabled) =>
  el(
    'label',
    {
      key,
      className: 'row',
    },
    [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked,
        disabled,
        'data-application-option': key,
        onChange: (event) => onChange(event.target.checked),
      }),
      el('span', { key: 'label', style: { flex: 1, minWidth: 0 } }, label),
    ]
  );

const Settings = ({ application, disabled, t }) => {
  if (application.intent) {
    return el('p', { className: 'meta' }, t('application.settingsHint'));
  }
  const { options, setOptions } = application;
  const update = (key, value) => setOptions({ ...options, [key]: value });
  return el('fieldset', { className: 'automation-fieldset', disabled }, [
    el('legend', { key: 'legend' }, t('application.settings')),
    check(
      'autoSelectResumeLanguage',
      t('application.autoSelectResumeLanguage'),
      options.autoSelectResumeLanguage,
      (value) => update('autoSelectResumeLanguage', value)
    ),
    el(
      'p',
      { key: 'language-hint', className: 'meta' },
      t('application.languagePolicyHint')
    ),
    el(ApplicationLetterSettings, { key: 'letter', options, setOptions, t }),
    check(
      'supervised',
      t('application.supervised'),
      options.supervised,
      (value) =>
        setOptions({
          ...options,
          supervised: value,
          autoExact: value ? false : options.autoExact,
        })
    ),
    check(
      'autoExact',
      t('application.autoExact'),
      options.autoExact,
      (value) => update('autoExact', value),
      options.supervised
    ),
    el('label', { key: 'delay', className: 'col' }, [
      t('application.delay'),
      el('input', {
        key: 'input',
        type: 'number',
        min: 0,
        max: 30000,
        step: 100,
        value: options.reviewDelayMs,
        'data-application-delay': true,
        onChange: (event) =>
          update('reviewDelayMs', Number(event.target.value)),
      }),
    ]),
    check('testMode', t('application.testMode'), options.testMode, (value) =>
      update('testMode', value)
    ),
    el('p', { key: 'hint', className: 'meta' }, t('application.settingsHint')),
  ]);
};

const Receipt = ({ receipt, t }) =>
  el('div', { className: 'col' }, [
    el(
      'p',
      {
        key: 'language',
        'data-application-language-policy': receipt.autoSelectResumeLanguage
          ? 'automatic'
          : 'manual',
      },
      t(
        receipt.autoSelectResumeLanguage
          ? 'application.languageAutomatic'
          : 'application.languageManual'
      )
    ),
    el('p', { key: 'url', className: 'meta' }, receipt.url),
    el(
      'p',
      { key: 'slot', className: 'meta' },
      t('application.slot', { slot: receipt.browserSlot })
    ),
    el(
      'p',
      { key: 'state', role: 'status', 'data-application-state': receipt.state },
      t(`application.state.${receipt.state}`)
    ),
    el(
      'p',
      {
        key: 'delivery',
        role: 'status',
        'data-application-delivery': receipt.delivery,
      },
      t(`application.delivery.${receipt.delivery}`)
    ),
    el(
      'p',
      { key: 'letter', 'data-application-letter-state': receipt.letter },
      t(`application.letter.${receipt.letter}`)
    ),
    receipt.testMode
      ? el('p', { key: 'test', role: 'note' }, t('application.testMode'))
      : null,
    receipt.supervised
      ? el(
          'p',
          {
            key: 'supervised',
            role: 'note',
            'data-application-supervised': true,
          },
          t('application.supervisedHint')
        )
      : null,
    receipt.hold
      ? el(
          'p',
          { key: 'hold', role: 'alert', 'data-application-hold': receipt.hold },
          t('application.hold', {
            reason: t(`application.hold.${receipt.hold}`),
          })
        )
      : null,
    receipt.reentryAvailable
      ? el(
          'p',
          { key: 'reentry', role: 'note', 'data-application-reentry': true },
          t('application.reenterHint')
        )
      : null,
    receipt.autoExact && !receipt.hold
      ? el(
          'p',
          { key: 'auto', role: 'note' },
          t('application.automaticDelay', { delay: receipt.reviewDelayMs })
        )
      : null,
    receipt.code
      ? el(
          'p',
          { key: 'refusal', role: 'alert' },
          `${t('application.refused')} (${receipt.code})`
        )
      : null,
    receipt.vacancy
      ? el('details', { key: 'vacancy', open: true }, [
          el('summary', { key: 'title' }, receipt.vacancy.title),
          el(
            'p',
            {
              key: 'description',
              style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
              'data-application-description': true,
            },
            receipt.vacancy.description
          ),
        ])
      : null,
    el(ApplicationDraftView, { key: 'draft', receipt, t }),
    receipt.report
      ? el(FormInspectionReport, { key: 'report', report: receipt.report })
      : null,
  ]);

const canRestore = (writable, receipt) => writable && Boolean(receipt?.draft);
const canEnter = (ready, confirmed, receipt) =>
  ready && confirmed && receipt.state === 'ready' && !receipt.attempted.enter;
const canOpenForm = (ready, confirmed, receipt) =>
  canEnter(ready, confirmed, receipt) &&
  !receipt.hold &&
  !receipt.page.scope &&
  !receipt.page.submit &&
  !receipt.page.questions &&
  !receipt.attempted.submit &&
  receipt.delivery === 'none';
const canBackup = (ready, confirmed, receipt) =>
  ready &&
  confirmed &&
  ['review', 'paused', 'deferred'].includes(receipt.state) &&
  !receipt.attempted.submit;
const prefillLabel = (receipt) =>
  receipt.autoExact && !receipt.hold
    ? 'application.prefillAutomatic'
    : 'application.prefill';
const PrefillControls = ({ receipt, action, writable, t }) =>
  receipt.supervised
    ? el(React.Fragment, null, [
        button(
          'answers',
          t('application.answers'),
          action('Prefill', { part: 'answers', confirm: true }),
          !writable
        ),
        button(
          'letter',
          t('application.letter'),
          action('Prefill', { part: 'cover-letter', confirm: true }),
          !writable || receipt.letter === 'not-requested'
        ),
      ])
    : button(
        'prefill',
        t(prefillLabel(receipt)),
        action('Prefill', { confirm: true }),
        !writable
      );
const NativeControls = ({ application, idle, confirmed, t }) => {
  const receipt = application.receipt;
  const ready = idle && application.known && receipt.active;
  const admitted = ready && !applicationLimitHeld(application);
  const writable =
    admitted &&
    confirmed &&
    receipt.state === 'review' &&
    !receipt.attempted.submit;
  const action = (name, input) => () => application.action(name, input);
  return el('div', { className: 'col' }, [
    el(ApplicationResumeView, { key: 'resume', receipt, action, writable, t }),
    el('div', { key: 'actions', className: 'row' }, [
      button('read', t('application.read'), action('Read'), !ready),
      button(
        'form',
        t('application.form'),
        action('Advance', { action: 'form', confirm: true }),
        !canOpenForm(admitted, confirmed, receipt)
      ),
      button(
        'enter',
        t(
          receipt.autoSelectResumeLanguage
            ? 'application.enterWithLanguage'
            : 'application.enter'
        ),
        action('Advance', { action: 'enter', confirm: true }),
        !canEnter(admitted, confirmed, receipt)
      ),
      el(PrefillControls, { key: 'prefill', receipt, action, writable, t }),
      receipt.reentryAvailable
        ? button(
            'reenter',
            t(
              receipt.autoSelectResumeLanguage
                ? 'application.enterWithLanguage'
                : 'application.reenter'
            ),
            action('Advance', { action: 'reenter', confirm: true }),
            !admitted || !confirmed
          )
        : null,
      button(
        'submit',
        t('application.submit'),
        action('Advance', { action: 'submit', confirm: true }),
        !writable
      ),
      button(
        'backup',
        t('application.backup'),
        action('Backup', { confirm: true }),
        !canBackup(ready, confirmed, receipt)
      ),
      button(
        'defer',
        t('application.defer'),
        action('Defer', { confirm: true }),
        !canBackup(ready, confirmed, receipt) || !receipt.page?.questions
      ),
      button(
        'restore',
        t('application.restore'),
        action('Restore', { confirm: true }),
        !canRestore(writable, receipt)
      ),
      button('close', t('application.close'), action('Close'), !ready),
    ]),
    check(
      'paused',
      t('application.pause'),
      receipt.paused,
      (paused) => application.action('Mode', { paused }),
      !idle || !application.known
    ),
    check(
      'noQuestionnaires',
      t('application.noQuestionnaires'),
      receipt.noQuestionnaires,
      (noQuestionnaires) => application.action('Mode', { noQuestionnaires }),
      !idle || !application.known
    ),
    el(
      'p',
      { key: 'session', className: 'meta' },
      t('application.sessionHint')
    ),
  ]);
};

const sameSelection = (application) =>
  application.intent?.url === application.target?.url &&
  application.intent?.browserSlot === application.target?.browserSlot;
const canStart = (application) =>
  application.known &&
  (application.missing || applicationMayRestart(application.receipt)) &&
  Boolean(application.target) &&
  !application.intent;
const canRelease = (application) =>
  application.known &&
  !application.receipt?.active &&
  Boolean(application.intent || application.receipt);
const canReopen = ({ known, receipt, intent }) =>
  known &&
  intent &&
  receipt &&
  !receipt.active &&
  receipt.delivery !== 'provider-confirmed';

const Context = ({ application, supported, t }) =>
  el(React.Fragment, null, [
    !supported
      ? el(
          'p',
          { key: 'unavailable', role: 'status' },
          t('application.unavailable')
        )
      : null,
    !application.target && !application.intent
      ? el('p', { key: 'choose' }, t('application.choose'))
      : null,
    application.target && !application.intent
      ? el('p', { key: 'target', className: 'meta' }, application.target.url)
      : null,
    application.intent && application.target && !sameSelection(application)
      ? el('p', { key: 'bound', role: 'note' }, t('application.bound'))
      : null,
  ]);
const Status = ({ application, t }) =>
  el(React.Fragment, null, [
    !application.known && (application.target || application.intent)
      ? el(
          'p',
          { key: 'unknown', role: 'status', 'data-application-unknown': true },
          t('application.unknown')
        )
      : null,
    application.missing
      ? el(
          'p',
          { key: 'missing', role: 'status', 'data-application-missing': true },
          t('application.missing')
        )
      : null,
    application.error
      ? el(
          'p',
          { key: 'error', role: 'alert' },
          `${t('application.failed')} (${application.error})`
        )
      : null,
    application.busy
      ? el('p', { key: 'busy', role: 'status' }, t('application.working'))
      : null,
    application.receipt
      ? el(Receipt, { key: 'receipt', receipt: application.receipt, t })
      : null,
  ]);
const RecoveryControls = ({ application, idle, supported, t }) => {
  const blocked = !idle || !supported;
  return el('div', { className: 'row' }, [
    button(
      'start',
      t('application.start'),
      application.start,
      blocked || !canStart(application)
    ),
    button(
      'recover',
      t('application.recover'),
      application.recover,
      blocked || !(application.intent || application.target)
    ),
    button(
      'reopen',
      t('application.reopen'),
      application.reopen,
      blocked || !canReopen(application)
    ),
    button(
      'release',
      t('application.release'),
      application.release,
      !idle || !canRelease(application)
    ),
    button(
      'stop',
      t('application.stop'),
      application.stop,
      application.stopping || !(application.busy || application.occupied)
    ),
  ]);
};
export const ApplicationPanel = ({ state, t }) => {
  const application = state.application;
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setConfirmed(false);
  }, [
    application.receipt?.revision,
    application.receipt?.state,
    application.target?.url,
    application.target?.browserSlot,
  ]);
  const supported = state.capabilities?.applicationReview === true;
  const idle =
    !application.busy && (!state.busy || state.busy === 'application-owned');
  return el(
    'section',
    {
      className: 'card col',
      'data-application-panel': true,
      'aria-label': t('application.title'),
    },
    [
      el('h3', { key: 'title' }, t('application.title')),
      el('p', { key: 'hint', role: 'note' }, t('application.hint')),
      el(Context, { key: 'context', application, supported, t }),
      el(Settings, {
        key: 'settings',
        application,
        t,
        disabled: !idle || Boolean(application.intent) || !supported,
      }),
      el(ApplicationLimitView, { key: 'limit', application, t }),
      el(Status, { key: 'status', application, t }),
      check(
        'confirm',
        t('application.confirm'),
        confirmed,
        setConfirmed,
        !idle || !supported
      ),
      el(RecoveryControls, {
        key: 'recovery',
        application,
        idle,
        supported,
        t,
      }),
      el(ApplicationLimitWaitControls, {
        key: 'limit-wait',
        application,
        confirmed,
        idle: idle && supported,
        t,
      }),
      application.receipt
        ? el(NativeControls, {
            key: 'native',
            application,
            idle: idle && supported,
            confirmed,
            t,
          })
        : null,
      el(ApplicationQueueView, {
        key: 'queue',
        application,
        idle: idle && supported,
        confirmed,
        t,
      }),
    ]
  );
};
