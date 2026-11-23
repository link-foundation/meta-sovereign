import React, { useState } from 'react';
import { useT } from './i18n.js';
import { RecordDetails } from './cv-experience-view.js';
import { Comparison } from './cv-translation-panel.js';
import { CvExperienceWorkplaceStage } from './cv-experience-workplace-stage.js';
import { HhExperienceWorkplace } from './cv-experience-hh-workplace.js';
import { useHhWorkplaceJob } from './cv-experience-workplace-state.js';
import { linkedinPositionMediaCandidate } from '../cv/linkedin-position-media-link.js';

const el = React.createElement;
const value = (input) =>
  input === null || input === undefined
    ? '—'
    : typeof input === 'string'
      ? input
      : JSON.stringify(input);
const fieldLabel = (field, t) =>
  [
    'company',
    'location',
    'description',
    'skills',
    'start',
    'end',
    'current',
  ].includes(field)
    ? t(`cvExperience.${field}`)
    : field === 'title'
      ? t('cvExperience.role')
      : field === 'about'
        ? t('experiencePlan.about')
        : field === 'media'
          ? t('experiencePlan.media')
          : field;

export const PlannedFields = ({ fields }) => {
  const t = useT();
  return fields.length
    ? el('table', { className: 'cv-experience-comparison stack-table' }, [
        el(
          'thead',
          { key: 'head' },
          el('tr', null, [
            el('th', { key: 'field' }, t('cv.field')),
            el('th', { key: 'before' }, t('experiencePlan.before')),
            el('th', { key: 'after' }, t('experiencePlan.after')),
          ])
        ),
        el(
          'tbody',
          { key: 'body' },
          fields.map((field) =>
            el(
              'tr',
              {
                key: field.field,
                'data-experience-plan-field': field.field,
              },
              [
                el('td', { key: 'field' }, fieldLabel(field.field, t)),
                el(
                  'td',
                  { key: 'before', 'data-label': t('experiencePlan.before') },
                  value(field.before)
                ),
                el(
                  'td',
                  {
                    key: 'after',
                    'data-label': t('experiencePlan.after'),
                    'data-plan-ready': field.ready,
                  },
                  field.ready
                    ? value(field.after)
                    : t(
                        `experiencePlan.${field.reason ?? 'translation-unconfirmed'}`
                      )
                ),
              ]
            )
          )
        ),
      ])
    : null;
};
const PlanItem = ({ item, profile = false, children }) => {
  const t = useT();
  const kind = profile ? 'profile' : item.kind;
  return el(
    'article',
    { className: 'col card', 'data-experience-plan-kind': kind },
    [
      el('h4', { key: 'title' }, [
        t(`experiencePlan.${kind}`),
        profile ? '' : ` · ${item.source?.company ?? item.target?.company}`,
      ]),
      el(PlannedFields, { key: 'fields', fields: item.fields }),
      ...item.notes.map((note, index) =>
        el(
          'p',
          { key: `note-${index}`, className: 'meta' },
          `${note.field ? `${fieldLabel(note.field, t)} · ` : ''}${t(`experiencePlan.${note.reason}`)}`
        )
      ),
      item.source
        ? el(RecordDetails, {
            key: 'source',
            label: t('experiencePlan.source'),
            job: item.source,
          })
        : null,
      item.target
        ? el(RecordDetails, {
            key: 'target',
            label: t('experiencePlan.target'),
            job: item.target,
          })
        : null,
      children,
    ]
  );
};
const HeadHunterAboutReview = ({ api, row, t }) => {
  const job = useHhWorkplaceJob(api, undefined, row.fingerprint, row.requestId);
  return job ? el(HhExperienceWorkplace, { job, t, about: true }) : null;
};
export const CvExperiencePlanView = ({
  row,
  api,
  onWorkplaceDraft,
  exports,
  linkedinPosition,
}) => {
  const t = useT();
  const [selected, setSelected] = useState(null);
  const { plan } = row;
  if (!plan) {
    return null;
  }
  const nativeHh =
    row.phase === 'completed' &&
    plan.target.platform === 'hh' &&
    exports?.some(
      ({ revision, provenance }) =>
        revision === plan.target.revision && provenance === 'hh-export'
    );
  const allowWorkplace =
    nativeHh &&
    typeof api?.vacancyCvWorkplacePlan === 'function' &&
    onWorkplaceDraft;
  const allowAbout =
    nativeHh &&
    plan.profile.fields.some(
      ({ field, ready, before, after }) =>
        field === 'about' &&
        ready &&
        typeof before === 'string' &&
        typeof after === 'string' &&
        after.trim() &&
        after.length <= 24000
    );
  const allowPosition =
    row.phase === 'completed' &&
    plan.target.platform === 'linkedin' &&
    exports?.some(
      ({ revision, provenance }) =>
        revision === plan.target.revision && provenance === 'linkedin-native'
    ) &&
    typeof api?.cvLinkedinPositionStage === 'function' &&
    linkedinPosition;
  return el(
    'div',
    { className: 'col', 'data-experience-plan-result': row.phase },
    [
      el(
        'p',
        { key: 'direction', style: { overflowWrap: 'anywhere' } },
        `${plan.source.platform.toUpperCase()} (${plan.source.language}, ${plan.source.revision.slice(0, 12)}) → ${plan.target.platform.toUpperCase()} (${plan.target.language}, ${plan.target.revision.slice(0, 12)})`
      ),
      ...plan.jobs.map((item, index) => {
        const available =
          allowWorkplace &&
          ['add', 'update'].includes(item.kind) &&
          item.fields.length;
        const positionAvailable =
          allowPosition &&
          ((item.kind === 'add' && plan.profile.target?.positionEditor) ||
            (item.kind === 'update' &&
              item.target?.native?.positionEditor &&
              (item.fields.length ||
                linkedinPositionMediaCandidate(item, { rename: true }).url)));
        return el(
          PlanItem,
          { key: index, item },
          available
            ? el('div', { key: 'workplace', className: 'col' }, [
                el(
                  'div',
                  { key: 'row', className: 'row wrap' },
                  el(
                    'button',
                    {
                      type: 'button',
                      'aria-expanded': selected === index,
                      'data-experience-workplace-select': index,
                      onClick: () =>
                        setSelected(selected === index ? null : index),
                    },
                    t('experiencePlan.workplaceSelect')
                  )
                ),
                selected === index
                  ? el(CvExperienceWorkplaceStage, {
                      key: 'stage',
                      api,
                      row,
                      jobIndex: index,
                      update: item.kind === 'update',
                      onDraft: onWorkplaceDraft,
                    })
                  : null,
              ])
            : positionAvailable
              ? el(
                  'div',
                  { className: 'row wrap' },
                  el(
                    'button',
                    {
                      type: 'button',
                      disabled: linkedinPosition.locked,
                      'data-experience-linkedin-position-select': index,
                      onClick: () =>
                        linkedinPosition.stage({
                          requestId: row.requestId,
                          fingerprint: row.fingerprint,
                          jobIndex: index,
                        }),
                    },
                    t('linkedinPosition.stage')
                  )
                )
              : null
        );
      }),
      el(
        PlanItem,
        { key: 'profile', item: plan.profile, profile: true },
        allowAbout ? el(HeadHunterAboutReview, { api, row, t }) : null
      ),
      el('h4', { key: 'translations' }, t('experiencePlan.translations')),
      ...plan.translations.map((comparison) =>
        el(Comparison, { key: comparison.input.requestId, comparison, t })
      ),
    ]
  );
};
