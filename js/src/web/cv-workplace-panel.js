import React from 'react';
import {
  cvWorkplaceMembership,
  cvWorkplaceUsesMembership,
} from '../jobs/cv-workplace-membership.js';
import { CvWorkplaceFields } from './cv-workplace-fields.js';
import { PreparationReceipt } from './cv-prepare-panel.js';
import { Busy } from './spinner.js';
import { HhExperienceWorkplace } from './cv-experience-hh-workplace.js';
import {
  cvWorkplaceValues,
  cvWorkplaceRecordId,
} from '../jobs/cv-workplace-plan.js';

const el = React.createElement;
const button = (action, handler, disabled, t) =>
  el(
    'button',
    {
      key: action,
      type: 'button',
      onClick: handler,
      disabled,
      'data-cv-workplace-action': action,
    },
    t(`cvWorkplace.${action}`)
  );
const valueLabel = (plan, field, value, t) => {
  if (field === 'resumes') {
    return (
      value
        .map(
          (row) =>
            `${row.hash} · ${t(row.checked ? 'cvWorkplace.yes' : 'cvWorkplace.no')}`
        )
        .join('\n') || t('cvWorkplace.empty')
    );
  }
  if (field === 'current') {
    return t(value ? 'cvWorkplace.yes' : 'cvWorkplace.no');
  }
  const language = plan.source.identity.language;
  if (field === 'areaId') {
    return (
      plan.metadata.areas.find((row) => row.id === value)?.[language].name ??
      t('cvWorkplace.empty')
    );
  }
  if (field === 'industryIds') {
    return (
      value
        .map(
          (id) =>
            plan.metadata.industries.find((row) => row.id === id)[language].name
        )
        .join(' · ') || t('cvWorkplace.empty')
    );
  }
  return value || t('cvWorkplace.empty');
};
const Plan = ({ state, idle, ready, t }) => {
  const plan = state.plan;
  if (!plan) {
    return null;
  }
  return el(
    'section',
    { className: 'col', 'data-cv-workplace-plan': plan.status },
    [
      el('h4', { key: 'title' }, t(`cvWorkplace.${plan.status}`)),
      el(
        'p',
        { key: 'identity', className: 'meta' },
        `${plan.source.identity.title} · ${plan.source.identity.language.toUpperCase()} · ${plan.source.identity.hash} · ${plan.source.identity.exportId}`
      ),
      plan.recordId !== null
        ? el(
            'p',
            { key: 'record', className: 'meta' },
            `${t(plan.operation === 'copy' ? 'cvWorkplace.originalRecord' : 'cvPrepare.recordId')}: ${plan.recordId} · ${plan.source.job.company} · ${plan.source.job.position}`
          )
        : el(
            'p',
            { key: 'record', className: 'meta' },
            plan.operation === 'add'
              ? t('cvWorkplace.add')
              : `${plan.source.job.company} · ${plan.source.job.position} · ${t('experiencePlan.workplaceResolve')}`
          ),
      ...plan.changes.map((change) =>
        el(
          'div',
          {
            key: change.field,
            className: 'col',
            'data-cv-workplace-change': change.field,
          },
          [
            el('h5', { key: 'field' }, t(`cvWorkplace.${change.field}`)),
            el(
              'span',
              { key: 'before-label', className: 'meta' },
              t(
                change.field === 'resumes'
                  ? 'cvWorkplace.membershipBefore'
                  : 'cvWorkplace.before'
              )
            ),
            el(
              'pre',
              {
                key: 'before',
                style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
              },
              valueLabel(plan, change.field, change.before, t)
            ),
            el(
              'span',
              { key: 'after-label', className: 'meta' },
              t(
                change.field === 'resumes' &&
                  ['add', 'copy'].includes(plan.operation)
                  ? 'cvWorkplace.copySelection'
                  : 'cvWorkplace.after'
              )
            ),
            el(
              'pre',
              {
                key: 'after',
                style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
              },
              valueLabel(plan, change.field, change.after, t)
            ),
          ]
        )
      ),
      el(
        'p',
        {
          key: 'fingerprint',
          className: 'meta',
          style: { overflowWrap: 'anywhere' },
        },
        plan.fingerprint
      ),
      plan.status === 'draft'
        ? button('approve', state.approve, !idle, t)
        : [
            state.native
              ? el(HhExperienceWorkplace, {
                  key: 'native',
                  job: state.native,
                  t,
                })
              : null,
            plan.recordId !== null || plan.operation === 'add'
              ? button(
                  'prepare',
                  state.prepare,
                  !idle ||
                    !ready ||
                    Boolean(
                      state.native?.active ||
                      state.native?.unknown ||
                      ['saved', 'unconfirmed', 'interrupted'].includes(
                        state.native?.row?.phase
                      )
                    ),
                  t
                )
              : null,
          ],
    ]
  );
};
const Source = ({ state, exports, idle, t }) =>
  el('div', { className: 'col' }, [
    el('label', { key: 'export', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('cvWorkplace.export')),
      el(
        'select',
        {
          key: 'select',
          value: state.choice,
          disabled: !idle,
          'data-cv-workplace-export': true,
          onChange: (event) => state.choose(event.target.value),
        },
        [
          el('option', { key: 'none', value: '' }, t('technology.choose')),
          ...exports.map((row) =>
            el(
              'option',
              {
                key: `${row.exportId}:${row.hash}`,
                value: `${row.exportId}:${row.hash}`,
              },
              `${row.title} · ${row.language.toUpperCase()} · ${row.hash}`
            )
          ),
        ]
      ),
    ]),
    button(
      state.operation === 'add' ? 'loadAddSource' : 'loadSource',
      () => state.loadSource(exports),
      !idle || !state.choice,
      t
    ),
    state.source && state.operation !== 'add'
      ? el('label', { key: 'job', className: 'chat-form-field' }, [
          el('span', { key: 'label' }, t('cvWorkplace.job')),
          el(
            'select',
            {
              key: 'select',
              value: state.source.jobIndex,
              disabled: !idle,
              'data-cv-workplace-job': true,
              onChange: (event) =>
                state.loadSource(exports, Number(event.target.value)),
            },
            state.jobs.map((job) =>
              el(
                'option',
                { key: job.index, value: job.index },
                `${job.company} · ${job.position}`
              )
            )
          ),
        ])
      : null,
    state.operation === 'add'
      ? null
      : el('label', { key: 'record', className: 'chat-form-field' }, [
          el(
            'span',
            { key: 'label' },
            t(
              state.operation === 'copy'
                ? 'cvWorkplace.originalRecord'
                : 'cvPrepare.recordId'
            )
          ),
          el('input', {
            key: 'input',
            value: state.recordId,
            inputMode: 'numeric',
            maxLength: 100,
            disabled: !idle,
            'data-cv-workplace-record': true,
            onChange: (event) => state.setRecordId(event.target.value),
          }),
        ]),
  ]);
const validWorkplaceReview = (review) => {
  let valid = false;
  try {
    cvWorkplaceValues(review.fields);
    if (review.operation !== 'add') {
      cvWorkplaceRecordId(review.recordId);
    }
    if (cvWorkplaceUsesMembership(review.operation)) {
      cvWorkplaceMembership(
        review.membership?.resumes,
        review.source?.identity.hash,
        review.operation
      );
    }
    valid = Boolean(
      review.source &&
      (review.source.job === null) === (review.operation === 'add')
    );
  } catch {
    /* Keep incomplete edits editable. */
  }
  return valid;
};
const Membership = ({ review, idle, capable, t }) =>
  el('div', { key: 'membership', className: 'col' }, [
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t(
        review.operation === 'copy'
          ? 'cvWorkplace.copyHint'
          : 'cvWorkplace.detachHint'
      )
    ),
    button(
      'loadMembership',
      review.loadMembership,
      !idle ||
        !review.source ||
        !/^\d{1,100}$/u.test(review.recordId) ||
        !capable,
      t
    ),
    review.membership
      ? el(
          'pre',
          {
            key: 'rows',
            'data-cv-workplace-membership': true,
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          },
          valueLabel(null, 'resumes', review.membership.resumes, t)
        )
      : null,
  ]);
const ExperienceWorkplaceReview = ({ review, idle, ready, t }) => {
  if (!review) {
    return null;
  }
  return el(
    'section',
    {
      className: 'col card',
      tabIndex: -1,
      'data-experience-workplace-review': true,
    },
    [
      el('div', { key: 'heading', className: 'row wrap' }, [
        el('h4', { key: 'title' }, t('experiencePlan.workplaceReview')),
        el(
          'button',
          {
            key: 'close',
            type: 'button',
            disabled:
              !idle ||
              Boolean(
                review.native?.active ||
                review.native?.unknown ||
                review.native?.busy
              ),
            onClick: review.dismiss,
          },
          t('experiencePlan.workplaceDismiss')
        ),
      ]),
      review.loadError
        ? el('div', { key: 'error', className: 'row wrap' }, [
            el('p', { key: 'text', role: 'alert' }, t('cvWorkplace.loadError')),
            button('reload', review.reload, !idle, t),
          ])
        : null,
      !review.loadError && !review.plan
        ? el(Busy, { key: 'load' }, t('common.loading'))
        : null,
      !review.matchingSlot &&
      (review.plan?.recordId || review.plan?.operation === 'add')
        ? el(
            'p',
            { key: 'slot', className: 'meta' },
            t('experiencePlan.workplaceSlot', { slot: review.browserSlot })
          )
        : null,
      ...(review.plan?.experience.unapplied ?? []).map((field) =>
        el(
          'p',
          { key: field, className: 'meta' },
          t('experiencePlan.workplaceUnapplied', {
            field: t(
              field === 'media'
                ? 'experiencePlan.media'
                : `cvExperience.${field}`
            ),
          })
        )
      ),
      el(Plan, {
        key: 'review',
        state: review,
        idle,
        ready: ready && review.matchingSlot,
        t,
      }),
    ]
  );
};
export const CvWorkplaceReview = ({ state, t }) => {
  const review = state.cvWorkplace;
  const preparation = state.cvTechnology.preparation;
  const idle = !state.busy;
  const valid = validWorkplaceReview(review);
  const ready = preparation.ready && state.capabilities?.cvSaveWatch === true;
  return el(
    'section',
    {
      className: 'col',
      'data-cv-workplace-review': true,
      style: { minWidth: 0, overflowWrap: 'anywhere' },
    },
    [
      el('h3', { key: 'title' }, t('cvWorkplace.title')),
      el(ExperienceWorkplaceReview, {
        key: 'experience',
        review: review.experienceReview,
        idle,
        ready,
        t,
      }),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t(
          review.operation === 'add'
            ? 'cvWorkplace.addHint'
            : 'cvWorkplace.hint'
        )
      ),
      el('label', { key: 'operation', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('cvWorkplace.operation')),
        el(
          'select',
          {
            key: 'select',
            value: review.operation ?? 'update',
            disabled: !idle,
            'data-cv-workplace-operation': true,
            onChange: (event) => review.setOperation(event.target.value),
          },
          ['update', 'add', 'copy', 'detach'].map((value) =>
            el('option', { key: value, value }, t(`cvWorkplace.${value}`))
          )
        ),
      ]),
      el(Source, {
        key: 'source',
        state: review,
        exports: state.resumeExports.exports.filter(
          (row) => row.browserSlot === state.values.browserSlot
        ),
        idle,
        t,
      }),
      cvWorkplaceUsesMembership(review.operation)
        ? el(Membership, {
            key: 'membership',
            review,
            idle,
            capable: state.capabilities?.cvSaveWatch === true,
            t,
          })
        : null,
      review.operation !== 'detach'
        ? el(CvWorkplaceFields, { key: 'fields', state: review, idle, t })
        : null,
      el('div', { key: 'actions', className: 'row' }, [
        button('propose', review.propose, !idle || !valid, t),
        button('reload', review.reload, !idle, t),
      ]),
      review.loadError
        ? el('p', { key: 'error', role: 'status' }, t('cvWorkplace.loadError'))
        : null,
      el(Plan, {
        key: 'plan',
        state: review,
        idle,
        ready,
        t,
      }),
      !preparation.ready
        ? el('p', { key: 'recovery', role: 'status' }, t('cvPrepare.recovery'))
        : null,
      el('div', { key: 'recovery-actions', className: 'row' }, [
        button('status', preparation.reload, !idle, t),
        preparation.canCancel
          ? button('cancel', preparation.cancel, !idle, t)
          : null,
      ]),
      el(PreparationReceipt, {
        key: 'receipt',
        result: preparation.cancellation ?? preparation.preparation,
        t,
      }),
    ]
  );
};
