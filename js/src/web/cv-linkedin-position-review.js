import React, { useEffect, useRef } from 'react';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';
import { PlannedFields } from './cv-experience-plan-view.js';

const el = React.createElement;
const button = (name, action, disabled, t) =>
  el(
    'button',
    {
      key: name,
      type: 'button',
      'data-linkedin-position-action': name,
      onClick: action,
      disabled,
    },
    t(`linkedinPosition.${name}`)
  );

const reviewErrors = {
  'cv-linkedin-position-conflict': 'conflict',
  'cv-linkedin-position-evidence': 'conflict',
  'cv-linkedin-position-translation': 'translation',
  'cv-linkedin-position-note': 'note',
  recover: 'recover',
};
const PositionProposal = ({ review, row }) => {
  const t = useT();
  const fields = Object.entries(review.fields).map(([field, after]) => ({
    field,
    before: review.baseline[field],
    after,
    ready: true,
  }));
  const media = [
    ['savedMedia', row?.save?.media],
    ['preparedMedia', row?.phase !== 'skipped' && row?.preparedMedia],
    ['manualMedia', row?.unapplied?.includes('media') && review.media],
    [
      review.media?.previousTitle ? 'proposedMediaRename' : 'proposedMedia',
      review.media,
    ],
  ].find(([, value]) => value);
  return el(React.Fragment, null, [
    el(
      'h4',
      { key: 'position' },
      `${review.desired.title} · ${review.desired.company}`
    ),
    el(PlannedFields, { key: 'fields', fields }),
    review.skills.length
      ? el(
          'p',
          { key: 'skills', className: 'meta' },
          t('linkedinPosition.proposedSkills', {
            skills: review.skills.join(', '),
          })
        )
      : null,
    media
      ? el(
          'p',
          {
            key: 'media',
            className: 'meta',
            style: { overflowWrap: 'anywhere' },
          },
          t(`linkedinPosition.${media[0]}`, media[1])
        )
      : null,
  ]);
};

const positionButtons = (state, t) => {
  const { busy, attempted, unknown, row } = state.job;
  const phase = row?.phase;
  if (unknown) {
    return [
      button('stop', state.stop, busy, t),
      button('status', state.refresh, busy, t),
    ];
  }
  if (!attempted) {
    return button('start', state.start, busy, t);
  }
  if (phase === 'prepared' && !row.decisionPending) {
    return [
      button(
        'save',
        () => state.decide('save'),
        busy || !(row.canSave ?? Object.keys(state.review.fields).length),
        t
      ),
      button('skip', () => state.decide('skip'), busy, t),
      button('leave', state.stop, busy, t),
    ];
  }
  if (['opening', 'prepared'].includes(phase)) {
    return button('stop', state.stop, busy, t);
  }
  if (['failed', 'stopped', 'closed', 'skipped'].includes(phase)) {
    return button('reset', state.reset, busy, t);
  }
  return null;
};

const PositionControls = ({ state }) => {
  const t = useT();
  const { job, review } = state;
  if (review.phase === 'draft') {
    return button('approve', state.approve, state.locked, t);
  }
  if (!job) {
    return el(Busy, null, t('linkedinPosition.loading'));
  }
  const { unknown, row } = job;
  const phase = row?.phase;
  const skillSummary = [
    ['preparedSkills', row?.preparedSkills],
    ['manualSkills', row?.unresolvedSkills],
  ].filter(([, skills]) => skills?.length);
  return el(React.Fragment, null, [
    el(
      'div',
      { key: 'controls', className: 'row wrap' },
      positionButtons(state, t)
    ),
    unknown || phase
      ? el(
          'p',
          {
            key: 'status',
            role: 'status',
            'data-linkedin-position-state': unknown ? 'unknown' : phase,
          },
          t(
            `linkedinPosition.${unknown ? 'unknown' : row.decisionPending ? 'deciding' : phase}`
          )
        )
      : null,
    phase === 'failed' && row.code === 'cv-linkedin-position-login-required'
      ? el(
          'p',
          { key: 'login', className: 'meta' },
          t('linkedinPosition.login')
        )
      : null,
    ...skillSummary.map(([name, skills]) =>
      el(
        'p',
        { key: name, className: 'meta' },
        t(`linkedinPosition.${name}`, {
          skills: skills.join(', '),
        })
      )
    ),
    row?.code === 'cv-linkedin-position-media-review'
      ? el(
          'p',
          { key: 'media-review', className: 'meta' },
          t('linkedinPosition.mediaReview')
        )
      : null,
  ]);
};

export const CvLinkedinPositionReview = ({ state }) => {
  const t = useT();
  const region = useRef(null);
  useEffect(() => {
    if (state.focus) {
      region.current?.focus();
    }
  }, [state.focus]);
  const { review, error, loading, operation } = state;
  if (!review && !error && !loading && !operation) {
    return null;
  }
  return el(
    'section',
    {
      className: 'col card',
      'data-linkedin-position-review': review?.phase ?? '',
      ref: region,
      tabIndex: -1,
      'aria-labelledby': 'cv-linkedin-position-heading',
    },
    [
      el(
        'h4',
        { key: 'title', id: 'cv-linkedin-position-heading' },
        t('linkedinPosition.title')
      ),
      loading || operation
        ? el(Busy, { key: 'loading' }, t('linkedinPosition.loading'))
        : null,
      error
        ? el(
            'p',
            { key: 'error', role: 'alert' },
            t(`linkedinPosition.${reviewErrors[error] ?? 'error'}`)
          )
        : null,
      error === 'recover' ? button('retry', state.retry, false, t) : null,
      review
        ? el(PositionProposal, { key: 'proposal', review, row: state.job?.row })
        : null,
      review ? el(PositionControls, { key: 'controls', state }) : null,
    ]
  );
};
