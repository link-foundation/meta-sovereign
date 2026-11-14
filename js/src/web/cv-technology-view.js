import React, { useState } from 'react';
import { useDates } from './i18n.js';

const el = React.createElement;
export const cvTechnologyFieldLabel = (review, row, t) => {
  const cv = review.sources.find(
    (source) => source.cv.language === row.language
  )?.cv;
  const index = row.index ?? Number(row.field?.split('.')[1]);
  const job = cv?.jobs[index];
  return job
    ? `${t('cvTechnology.position')}: ${job.company} · ${job.position} · ${job.start ?? '?'} – ${job.current ? t('cvTechnology.current') : (job.end ?? '?')}`
    : t(`cvTechnology.${row.field}`);
};
const provenance = (review, dateTime) =>
  review.sources
    .map(
      (source) =>
        `${source.identity.language.toUpperCase()} · ${source.identity.title} · ${source.identity.hash} · ${source.identity.exportId} · ${dateTime(source.identity.capturedAt)} · ${source.identity.sha256}`
    )
    .join('\n');
const Change = ({ change, state, idle, t }) =>
  el('article', { className: 'col', 'data-cv-technology-change': change.id }, [
    el('label', { key: 'choice', className: 'check' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        style: { width: 'auto', minHeight: 'auto' },
        checked: state.selected.includes(change.id),
        disabled: !idle || state.review.report.blockers.length > 0,
        onChange: (event) => state.select(change.id, event.target.checked),
        'data-cv-technology-select': change.id,
      }),
      el(
        'span',
        { key: 'label' },
        `${change.language.toUpperCase()} · ${cvTechnologyFieldLabel(state.review, change, t)}`
      ),
    ]),
    el('details', { key: 'before' }, [
      el('summary', { key: 'label' }, t('cvTechnology.before')),
      el(
        'pre',
        {
          key: 'text',
          className: 'cv-technology-prose',
          style: {
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontFamily: 'inherit',
          },
        },
        change.before
      ),
    ]),
    el('details', { key: 'after', open: true }, [
      el('summary', { key: 'label' }, t('cvTechnology.after')),
      el(
        'pre',
        {
          key: 'text',
          style: {
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontFamily: 'inherit',
          },
        },
        change.after
      ),
    ]),
  ]);
export const CvTechnologyPlanView = ({ state, catalog, idle, t }) => {
  const review = state.review;
  const [changeLimit, setChangeLimit] = useState(10);
  const [evidenceLimit, setEvidenceLimit] = useState(10);
  const { dateTime } = useDates();
  return el(
    'div',
    {
      className: 'col',
      'data-cv-technology-plan': review.fingerprint,
      style: { minWidth: 0, overflowWrap: 'anywhere' },
    },
    [
      el(
        'p',
        { key: 'state', role: 'status' },
        t(
          review.status === 'reviewed'
            ? 'cvTechnology.saved'
            : 'cvTechnology.draft'
        )
      ),
      el('p', { key: 'date', className: 'meta' }, dateTime(review.createdAt)),
      el(
        'pre',
        {
          key: 'provenance',
          className: 'meta',
          style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
        },
        provenance(review, dateTime)
      ),
      review.catalog.revision !== catalog?.revision
        ? el('p', { key: 'stale', role: 'status' }, t('technology.stale'))
        : null,
      review.report.complete
        ? el('p', { key: 'complete' }, t('cvTechnology.complete'))
        : null,
      review.report.blockers.length
        ? el(
            'div',
            {
              key: 'blockers',
              role: 'alert',
              'data-cv-technology-blockers': true,
            },
            [
              el('p', { key: 'label' }, t('cvTechnology.blocked')),
              ...review.report.blockers.map((blocker, index) =>
                el(
                  'p',
                  { key: index, className: 'meta' },
                  `${t(`cvTechnology.${blocker.code}`)} · ${blocker.language?.toUpperCase() ?? ''} · ${cvTechnologyFieldLabel(review, blocker, t)} · ${blocker.raw ?? ''}`
                )
              ),
            ]
          )
        : null,
      el('details', { key: 'coverage', 'data-cv-technology-coverage': true }, [
        el('summary', { key: 'label' }, t('cvTechnology.coverage')),
        ...review.report.coverage.map((row) =>
          el(
            'p',
            { key: `${row.language}:${row.field}` },
            `${row.language.toUpperCase()} · ${cvTechnologyFieldLabel(review, row, t)} · ${row.before.length} → ${row.proposed.length} · ${row.proposed.join(' · ')}`
          )
        ),
      ]),
      el('details', { key: 'raw', 'data-cv-technology-raw': true }, [
        el('summary', { key: 'label' }, t('cvTechnology.raw')),
        ...review.report.fields.slice(0, evidenceLimit).map((field) =>
          el('div', { key: `${field.language}:${field.field}` }, [
            el(
              'p',
              { key: 'title', className: 'meta' },
              `${field.language.toUpperCase()} · ${cvTechnologyFieldLabel(review, field, t)} · ${t('cvTechnology.duplicates')}: ${field.duplicates.length}`
            ),
            el(
              'pre',
              {
                key: 'text',
                style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
              },
              field.rawTerms.join('\n')
            ),
          ])
        ),
        evidenceLimit < review.report.fields.length
          ? el(
              'button',
              {
                key: 'more',
                type: 'button',
                onClick: () => setEvidenceLimit((old) => old + 10),
              },
              t('cvTechnology.moreEvidence')
            )
          : null,
      ]),
      ...review.report.changes
        .slice(0, changeLimit)
        .map((change) =>
          el(Change, { key: change.id, change, state, idle, t })
        ),
      changeLimit < review.report.changes.length
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              onClick: () => setChangeLimit((old) => old + 10),
            },
            t('cvTechnology.moreChanges')
          )
        : null,
      el(
        'button',
        {
          key: 'save',
          type: 'button',
          disabled:
            !idle ||
            !state.selected.length ||
            review.report.blockers.length > 0 ||
            review.catalog.revision !== catalog?.revision,
          onClick: state.save,
          'data-cv-technology-action': 'save',
        },
        t('cvTechnology.save')
      ),
    ]
  );
};
