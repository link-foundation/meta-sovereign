import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { PrivateCvJobState } from './private-cv-job-state.js';
import { experienceReviewRunning } from '../cv/experience-review-record.js';
import { confirmedExperiencePlan } from '../cv/experience-plan-receipt.js';
import { PlannedFields } from './cv-experience-plan-view.js';

const el = React.createElement;
const known = ['completed', 'left', 'failed', 'interrupted', 'unconfirmed'];
const checked = (row, id) => {
  if (
    row?.requestId !== id ||
    (!experienceReviewRunning(row) && !known.includes(row.phase)) ||
    !Array.isArray(row.history) ||
    !Array.isArray(row.groupNotes) ||
    !Array.isArray(row.pending) ||
    (row.phase === 'prepared' &&
      (!row.comparison ||
        row.current?.key !== row.pending[0] ||
        !row.current?.input?.requestId))
  ) {
    throw new Error('The experience review was not confirmed.');
  }
  return row;
};
export const useExperienceReview = (api) => {
  const [state, changed] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    if (!api?.cvExperienceReviewStart) {
      return;
    }
    const job = new PrivateCvJobState(api, changed, {
      initial: {},
      fields: [],
      prefix: 'cvExperienceReview',
      pendingKey: 'ms.cv.experience-review',
      checked,
      running: experienceReviewRunning,
    });
    actions.current = job;
    changed(job.state);
    if (job.state.unknown) {
      void job.refresh();
    }
    return () => job.dispose();
  }, [api]);
  return { state, actions: actions.current };
};

const readPreview = async (api, comparison, current) => {
  const { requestId, fingerprint, hh, linkedin, to } = comparison;
  const plan = await confirmedExperiencePlan(
    await api.cvExperiencePlanStatus({ requestId }),
    requestId
  );
  if (
    plan.fingerprint !== fingerprint ||
    plan.options.hh !== hh ||
    plan.options.linkedin !== linkedin ||
    plan.options.to !== to
  ) {
    throw new Error('The comparison does not match the current editor.');
  }
  const item =
    current.key === 'about'
      ? plan.plan.profile
      : plan.plan.jobs.find(
          ({ sourceIndex }) => `position-${sourceIndex}` === current.key
        );
  if (!item || !item.fields.length) {
    throw new Error('The current review has no matching comparison.');
  }
  return item;
};

const CurrentReview = ({ row, api, decide, busy }) => {
  const [item, setItem] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const current = row.current;
  const comparison = row.comparison;
  const t = useT();
  useEffect(() => {
    let live = true;
    readPreview(api, comparison, current).then(
      (value) => live && setItem(value),
      () => live && setError(true)
    );
    return () => {
      live = false;
    };
  }, [api, comparison.requestId, comparison.fingerprint, current.key, attempt]);
  return el('div', { className: 'col' }, [
    el(
      'h4',
      { key: 'item' },
      current.key === 'about'
        ? t('experiencePlan.about')
        : (item?.source?.company ?? t('experienceReview.position'))
    ),
    item
      ? el(PlannedFields, { fields: item.fields, key: 'fields' })
      : el(
          'p',
          {
            key: 'preview',
            role: error ? 'alert' : 'status',
          },
          t(error ? 'experienceAuto.openError' : 'experiencePlan.working')
        ),
    current.notes?.length
      ? el(
          'p',
          { key: 'notes', className: 'meta' },
          t('experienceReview.manual')
        )
      : null,
    error && !item
      ? el(
          'button',
          {
            key: 'retry',
            type: 'button',
            onClick: () => {
              setError(false);
              retry(attempt + 1);
            },
          },
          t('error.retry')
        )
      : null,
    el(
      'div',
      { key: 'decision', className: 'row wrap' },
      ['save', 'skip'].map((choice) =>
        el(
          'button',
          {
            key: choice,
            type: 'button',
            'data-experience-review-action': choice,
            disabled:
              busy ||
              !!current.decision ||
              (choice === 'save' && (!item || !current.canSave)),
            onClick: () =>
              decide({
                key: current.key,
                nativeRequestId: current.input.requestId,
                decision: choice,
              }),
          },
          t(`experienceReview.${choice}`)
        )
      )
    ),
  ]);
};

const ReviewHistory = ({ row }) => {
  const t = useT();
  const manual =
    row.history.some(
      ({ outcome, notes }) => outcome === 'manual' || notes?.length
    ) || row.groupNotes.some(({ reason }) => reason !== 'target-only-kept');
  return el(React.Fragment, null, [
    row.history.length
      ? el(
          'ul',
          { key: 'history', 'data-experience-review-history': true },
          row.history.map(({ key, outcome, code, revision }) =>
            el(
              'li',
              {
                key,
                'data-experience-review-outcome': outcome,
                'data-experience-review-revision': revision ?? undefined,
                title: code ?? undefined,
              },
              `${t(key === 'about' ? 'experiencePlan.about' : 'experienceReview.position')} · ${t(`experienceReview.${outcome}`)}`
            )
          )
        )
      : null,
    manual
      ? el(
          'p',
          { key: 'manual', className: 'meta' },
          t('experienceReview.manual')
        )
      : null,
  ]);
};

export const ExperienceReviewStatus = ({ review, api, openComparison }) => {
  const { state, actions } = review;
  const t = useT();
  const [opening, setOpening] = useState(false);
  const [comparisonError, setComparisonError] = useState(false);
  if (!state?.attempted && !state?.unknown) {
    return null;
  }
  const { row } = state;
  const phase = state.unknown ? 'unknown' : (row?.phase ?? 'acquiring');
  const running = experienceReviewRunning(row);
  const resumable =
    phase === 'interrupted' &&
    ['opening', 'prepared', 'refreshing', 'replanning'].includes(row.lastPhase);
  const open = async () => {
    const { hh, linkedin, requestId, fingerprint } = row.comparison;
    setOpening(true);
    setComparisonError(false);
    try {
      setComparisonError(
        !(await openComparison({
          hh,
          linkedin,
          plan: { requestId, fingerprint },
        }))
      );
    } catch {
      setComparisonError(true);
    } finally {
      setOpening(false);
    }
  };
  const button = (name, run, disabled) =>
    el(
      'button',
      {
        key: name,
        type: 'button',
        onClick: run,
        disabled,
        'data-experience-review-action': name,
      },
      t(`experienceReview.${name}`)
    );
  return el(
    'section',
    { className: 'col card', 'data-experience-review': true },
    [
      el('h4', { key: 'title' }, t('experienceReview.title')),
      el(
        'p',
        { key: 'phase', role: 'status', 'data-experience-review-phase': phase },
        t(
          `experienceReview.${row?.waitingLogin && !state.unknown ? 'login' : phase}`
        )
      ),
      phase === 'prepared'
        ? el(CurrentReview, {
            key: row.current.input.requestId,
            row,
            api,
            busy: state.busy,
            decide: (input) => actions.mutate('Decide', input),
          })
        : null,
      row ? el(ReviewHistory, { key: 'history', row }) : null,
      el('label', { key: 'id', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('hhAcquisition.requestId')),
        el('input', { key: 'value', readOnly: true, value: state.requestId }),
      ]),
      comparisonError
        ? el(
            'p',
            { key: 'open-error', role: 'alert' },
            t('experienceAuto.openError')
          )
        : null,
      el('div', { key: 'buttons', className: 'row wrap' }, [
        button('status', () => actions.refresh(), state.busy),
        running || state.unknown
          ? button('stop', () => actions.mutate('Stop'), state.busy)
          : null,
        resumable
          ? button('resume', () => actions.mutate('Resume'), state.busy)
          : null,
        !running && !state.unknown
          ? button('new', () => actions.newRequest(), state.busy)
          : null,
        !running && !state.unknown && row?.comparison && openComparison
          ? button('comparison', open, opening || state.busy)
          : null,
      ]),
    ]
  );
};
