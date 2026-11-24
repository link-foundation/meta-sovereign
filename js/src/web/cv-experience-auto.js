import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { PrivateCvJobState } from './private-cv-job-state.js';
import {
  ExperienceReviewStatus,
  useExperienceReview,
} from './cv-experience-review.js';
import { experienceReviewRunning } from '../cv/experience-review-record.js';
import {
  experienceAutoOptions,
  experienceAutoRunning,
} from '../cv/experience-auto-record.js';

const el = React.createElement;
const revision = (value) => /^[a-f0-9]{64}$/u.test(value ?? '');
const finalPhases = ['completed', 'failed', 'stopped', 'interrupted'];
const checked = (row, requestId) => {
  if (
    row?.requestId !== requestId ||
    (!experienceAutoRunning(row) && !finalPhases.includes(row.phase)) ||
    (row.phase === 'completed' &&
      (!revision(row.hh) ||
        !revision(row.linkedin) ||
        !revision(row.plan?.fingerprint) ||
        !/^cv-auto-plan-[a-f0-9]{32}$/u.test(row.plan.requestId)))
  ) {
    throw new Error('The automatic experience request was not confirmed.');
  }
  return row;
};
const initial = {
  url: '',
  language: 'en',
  hash: '',
  browserSlot: 'jobs',
  to: 'linkedin',
  refresh: false,
};
export const createExperienceAutoState = (api, changed, options = {}) => {
  const job = new PrivateCvJobState(api, changed, {
    initial,
    fields: Object.keys(initial),
    prefix: 'cvExperienceAuto',
    pendingKey: 'ms.cv.experience-auto',
    checked,
    running: experienceAutoRunning,
    adopt: (_state, row) =>
      row.options
        ? Object.fromEntries(
            Object.keys(initial).map((name) => [
              name,
              row.options[name] ?? initial[name],
            ])
          )
        : {},
    ...options,
  });
  changed(job.state);
  if (job.state.unknown) {
    void job.refresh();
  }
  return job;
};
const inputFields = [
  ['url', 'linkedinExperience.url'],
  ['hash', 'hhAcquisition.hash'],
  ['browserSlot', 'hhAcquisition.browserSlot'],
  ['requestId', 'hhAcquisition.requestId'],
];
const routes = [
  ['linkedin', 'HH → LinkedIn'],
  ['hh', 'LinkedIn → HH'],
];
const languages = [
  ['en', 'English'],
  ['ru', 'Русский'],
];

const AutoOptions = ({ state, actions, locked }) => {
  const t = useT();
  const input = (name, extra = {}) => ({
    key: 'field',
    value: state[name],
    disabled: locked,
    'data-experience-auto-field': name,
    onChange: (event) => actions.input(name, event.target.value.trim()),
    ...extra,
  });
  const field = (name, label, control) =>
    el('label', { key: name, className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t(label)),
      control,
    ]);
  const select = (name, label, choices) =>
    field(
      name,
      label,
      el(
        'select',
        input(name),
        choices.map(([id, text]) => el('option', { key: id, value: id }, text))
      )
    );
  return el(React.Fragment, null, [
    ...inputFields.map(([name, label]) =>
      field(
        name,
        label,
        el(
          'input',
          input(name, {
            type: name === 'url' ? 'url' : 'text',
            maxLength: name === 'url' ? 300 : 100,
          })
        )
      )
    ),
    select('language', 'linkedinExperience.language', languages),
    select('to', 'experiencePlan.direction', routes),
    el('label', { key: 'refresh', className: 'row wrap' }, [
      el('input', {
        key: 'field',
        type: 'checkbox',
        checked: state.refresh,
        disabled: locked,
        onChange: (event) => actions.input('refresh', event.target.checked),
      }),
      t('hhAcquisition.refresh'),
    ]),
  ]);
};

const validStart = (state) => {
  try {
    experienceAutoOptions({
      ...Object.fromEntries(
        Object.keys(initial).map((name) => [name, state[name]])
      ),
      requestId: state.requestId,
      hash: state.hash || null,
    });
    return true;
  } catch {
    return false;
  }
};
const autoPhase = (state) => {
  if (state.unknown) {
    return 'unknown';
  }
  if (experienceAutoRunning(state.row) && state.row.step === 'waiting-login') {
    return 'waiting-login';
  }
  if (
    state.row?.phase === 'interrupted' &&
    state.row.recoveryAvailable === true
  ) {
    return 'recoverable';
  }
  return state.row?.phase ?? (state.busy ? 'acquiring-hh' : null);
};

const AutoControls = (props) => {
  const { state, actions, disabled, openComparison, review, api } = props;
  const t = useT();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const active = experienceAutoRunning(state.row);
  const reviewActive =
    experienceReviewRunning(review.state?.row) || review.state?.unknown;
  const reviewShown = review.state?.attempted || review.state?.unknown;
  const locked = state.busy || state.attempted || reviewActive;
  const button = (name, run, blocked) =>
    el(
      'button',
      {
        key: name,
        type: 'button',
        onClick: run,
        disabled: blocked,
        'data-experience-auto-action': name,
      },
      t(`experienceAuto.${name}`)
    );
  const open = async () => {
    setOpening(true);
    setOpenError(false);
    try {
      setOpenError(!(await openComparison(state.row)));
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  };
  const phase = autoPhase(state);
  const reviewBlocked =
    disabled ||
    state.busy ||
    state.unknown ||
    active ||
    phase === 'recoverable';
  const autoRequestId =
    state.row?.phase === 'completed' && !state.unknown
      ? state.row.requestId
      : null;
  const reviewInput = autoRequestId
    ? { autoRequestId }
    : {
        ...Object.fromEntries(
          Object.keys(initial).map((name) => [name, state[name]])
        ),
        hash: state.hash || null,
      };
  return el('details', { className: 'col', 'data-experience-auto': true }, [
    el('summary', { key: 'title' }, t('experienceAuto.title')),
    reviewShown
      ? null
      : el('p', { key: 'hint', className: 'meta' }, t('experienceAuto.hint')),
    reviewShown
      ? null
      : el(AutoOptions, { key: 'options', locked, state, actions }),
    reviewShown
      ? null
      : el('div', { key: 'actions', className: 'row wrap' }, [
          button(
            'start',
            () => actions.mutate('Start', { hash: state.hash || null }),
            locked || !validStart(state)
          ),
          button(
            'status',
            () => actions.refresh(),
            state.busy || !state.requestId
          ),
          phase === 'recoverable'
            ? button('resume', () => actions.mutate('Resume'), state.busy)
            : null,
          button(
            'stop',
            () => actions.mutate('Stop'),
            state.busy || (!active && !state.unknown)
          ),
          button(
            'new',
            () => {
              setOpenError(false);
              actions.newRequest();
            },
            state.busy || active || state.unknown || opening
          ),
          state.row?.phase === 'completed' && !state.unknown
            ? button('open', open, opening || disabled)
            : null,
          review.state && !review.state.attempted
            ? el(
                'button',
                {
                  key: 'review',
                  type: 'button',
                  'data-experience-review-action': 'start',
                  disabled:
                    reviewBlocked || (!autoRequestId && !validStart(state)),
                  onClick: () => review.actions.mutate('Start', reviewInput),
                },
                t('experienceReview.start')
              )
            : null,
          review.state && !review.state.attempted && state.requestId
            ? el(
                'button',
                {
                  key: 'review-status',
                  type: 'button',
                  onClick: () => {
                    review.actions.input('requestId', state.requestId);
                    return review.actions.refresh();
                  },
                  disabled: state.busy || active,
                  'data-experience-review-action': 'recover',
                },
                t('experienceReview.recover')
              )
            : null,
        ]),
    phase && !reviewShown
      ? el(
          'p',
          { key: 'phase', role: 'status', 'data-experience-auto-phase': phase },
          t(`experienceAuto.${phase}`)
        )
      : null,
    openError
      ? el(
          'p',
          { key: 'open-error', role: 'alert' },
          t('experienceAuto.openError')
        )
      : null,
    reviewShown
      ? el(ExperienceReviewStatus, {
          key: 'review',
          review,
          api,
          openComparison,
        })
      : null,
  ]);
};

export const CvExperienceAuto = ({ api, disabled, openComparison }) => {
  const [state, changed] = useState(null);
  const actions = useRef(null);
  const review = useExperienceReview(api);
  useEffect(() => {
    const job = createExperienceAutoState(api, changed);
    actions.current = job;
    return () => job.dispose();
  }, [api]);
  return state
    ? el(AutoControls, {
        state,
        actions: actions.current,
        disabled,
        openComparison,
        review,
        api,
      })
    : null;
};
