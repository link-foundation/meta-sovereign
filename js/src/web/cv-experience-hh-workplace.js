import React from 'react';

const el = React.createElement;
const button = (job, t, action, callback = job[action], label = action) =>
  el(
    'button',
    {
      key: action,
      type: 'button',
      disabled: job.busy,
      onClick: callback,
      'data-hh-workplace-action': action,
    },
    t(`hhWorkplace.${label}`)
  );

export const HhExperienceWorkplace = ({ job, t, about }) => {
  const phase = job.row?.phase;
  let actions;
  if (job.unknown) {
    actions = [button(job, t, 'refresh'), button(job, t, 'stop')];
  } else if (!job.attempted) {
    actions = [
      button(job, t, 'start', job.start, about ? 'aboutStart' : 'start'),
    ];
  } else if (phase === 'prepared' && !job.row.decisionPending) {
    actions = [
      button(job, t, 'save', () => job.decide('save')),
      button(job, t, 'skip', () => job.decide('skip')),
      button(job, t, 'leave', job.stop),
    ];
  } else if (job.active) {
    actions = [button(job, t, 'stop')];
  } else if (
    ['skipped', 'stopped', 'closed', 'failed'].includes(phase) &&
    job.row.code !== 'cv-hh-workplace-attempted'
  ) {
    actions = [button(job, t, 'reset')];
  }
  const status = job.unknown
    ? 'unknown'
    : (phase ?? (job.busy ? 'opening' : null));
  const message =
    status === 'failed' &&
    job.row.code === 'jobs-cv-experience-record-ambiguous'
      ? 'ambiguous'
      : about && ['saving', 'saved'].includes(status)
        ? status === 'saving'
          ? 'aboutSaving'
          : 'aboutSaved'
        : status;
  return el(
    'section',
    {
      className: 'col',
      [about ? 'data-hh-about-phase' : 'data-hh-workplace-phase']:
        status ?? 'idle',
    },
    [
      actions
        ? el('div', { key: 'actions', className: 'row wrap' }, actions)
        : null,
      message
        ? el(
            'p',
            { key: 'status', role: 'status' },
            t(`hhWorkplace.${message}`)
          )
        : null,
    ]
  );
};
