import React from 'react';

const el = React.createElement;
const button = (
  job,
  translate,
  action,
  callback = job[action],
  label = action
) =>
  el(
    'button',
    {
      key: action,
      type: 'button',
      disabled: job.busy,
      onClick: callback,
      'data-hh-workplace-action': action,
    },
    translate(label)
  );

const linkedinLabels = new Set([
  'aboutStart',
  'aboutSaved',
  'save',
  'opening',
  'prepared',
  'verifying',
  'failed',
  'unconfirmed',
  'interrupted',
]);
export const HhExperienceWorkplace = ({ job, t, about, linkedin }) => {
  const label = (name) => {
    const localized = name === 'left' ? 'stopped' : name;
    return t(
      linkedin && linkedinLabels.has(localized)
        ? `linkedinAbout.${localized}`
        : `hhWorkplace.${localized}`
    );
  };
  const phase = job.row?.phase;
  let actions;
  if (job.unknown) {
    actions = [button(job, label, 'refresh'), button(job, label, 'stop')];
  } else if (!job.attempted) {
    actions = [
      button(job, label, 'start', job.start, about ? 'aboutStart' : 'start'),
    ];
  } else if (phase === 'prepared' && !job.row.decisionPending) {
    actions = [
      button(job, label, 'save', () => job.decide('save')),
      button(job, label, 'skip', () => job.decide('skip')),
      button(job, label, 'leave', job.stop),
    ];
  } else if (job.active) {
    actions = [button(job, label, 'stop')];
  } else if (
    ['skipped', 'stopped', 'closed', 'failed', 'left'].includes(phase) &&
    job.row.code !== 'cv-hh-workplace-attempted'
  ) {
    actions = [button(job, label, 'reset')];
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
      [linkedin
        ? 'data-linkedin-about-phase'
        : about
          ? 'data-hh-about-phase'
          : 'data-hh-workplace-phase']: status ?? 'idle',
    },
    [
      actions
        ? el('div', { key: 'actions', className: 'row wrap' }, actions)
        : null,
      message
        ? el('p', { key: 'status', role: 'status' }, label(message))
        : null,
    ]
  );
};
