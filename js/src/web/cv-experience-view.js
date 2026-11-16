import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const value = (input) =>
  input === null || input === undefined
    ? '—'
    : typeof input === 'string'
      ? input
      : JSON.stringify(input);
const fields = new Set([
  'company',
  'title',
  'start',
  'end',
  'current',
  'location',
  'description',
  'skills',
  'industries',
  'website',
  'areaId',
]);
const RecordDetails = ({ job, label }) => {
  const t = useT();
  return el('details', null, [
    el(
      'summary',
      { key: 'summary' },
      `${label ?? ''} ${t('cvExperience.original')}`.trim()
    ),
    el('pre', { key: 'body' }, JSON.stringify(job, null, 2)),
  ]);
};
const DifferenceRow = ({ difference }) => {
  const t = useT();
  const field = difference.field;
  const label = fields.has(field)
    ? t(`cvExperience.${field === 'title' ? 'role' : field}`)
    : field;
  return el('tr', { 'data-experience-field': field }, [
    el('td', { key: 'field', 'data-title': '' }, [
      label,
      difference.requiresTranslation
        ? ` · ${t('cvExperience.translation')}`
        : '',
    ]),
    el('td', { key: 'left', 'data-label': 'HH' }, value(difference.left)),
    el(
      'td',
      { key: 'right', 'data-label': 'LinkedIn' },
      value(difference.right)
    ),
  ]);
};
const ExperiencePair = ({ pair }) => {
  const t = useT();
  return el(
    'article',
    { 'data-experience-pair': pair.leftIndex, className: 'col card' },
    [
      el('h4', { key: 'heading' }, pair.left.company),
      el(
        'table',
        { key: 'table', className: 'cv-experience-comparison stack-table' },
        [
          el(
            'thead',
            { key: 'head' },
            el('tr', null, [
              el('th', { key: 'field' }, t('cv.field')),
              el('th', { key: 'hh' }, 'HH'),
              el('th', { key: 'linkedin' }, 'LinkedIn'),
            ])
          ),
          el(
            'tbody',
            { key: 'body' },
            pair.differences.map((difference) =>
              el(DifferenceRow, { key: difference.field, difference })
            )
          ),
        ]
      ),
      pair.differences.length
        ? null
        : el('p', { key: 'equal' }, t('cvExperience.equal')),
      el(RecordDetails, { key: 'hh', label: 'HH', job: pair.left }),
      el(RecordDetails, {
        key: 'linkedin',
        label: 'LinkedIn',
        job: pair.right,
      }),
    ]
  );
};
const ExperienceJob = ({ item, platform, review = false }) => {
  const t = useT();
  const job = item.job;
  return el(
    'article',
    {
      className: 'col card',
      ...(review
        ? { 'data-experience-review': item.reason }
        : { 'data-experience-only': platform }),
    },
    [
      el(
        'h4',
        { key: 'heading' },
        review
          ? t(`cvExperience.${item.reason}`)
          : t('cvExperience.only', { platform })
      ),
      review ? el('span', { key: 'side', className: 'meta' }, platform) : null,
      el('strong', { key: 'company' }, job.company),
      el('span', { key: 'role' }, job.title ?? ''),
      el(
        'span',
        { key: 'dates', className: 'meta' },
        `${job.start ?? '—'} — ${job.current ? '…' : (job.end ?? '—')}`
      ),
      el(RecordDetails, { key: 'details', job }),
    ]
  );
};
export const CvExperienceComparison = ({ comparison }) => {
  const t = useT();
  if (!comparison) {
    return null;
  }
  const oneSided = (items, platform) =>
    items.map((item) =>
      el(ExperienceJob, { key: `${platform}-${item.index}`, item, platform })
    );
  return el(
    'section',
    { className: 'col', 'data-cv-experience': comparison.status },
    [
      el('h3', { key: 'title' }, t('cvExperience.title')),
      el(
        'p',
        { key: 'intro', className: 'meta' },
        t('cvExperience.reviewOnly')
      ),
      ...(comparison.status !== 'compared'
        ? [
            el(
              'p',
              { key: 'unavailable', role: 'status' },
              t('cvExperience.unavailable')
            ),
          ]
        : [
            el(
              'p',
              { key: 'counts' },
              t('cvExperience.counts', {
                pairs: comparison.pairs.length,
                hh: comparison.onlyLeft.length,
                linkedin: comparison.onlyRight.length,
                review: comparison.review.length,
              })
            ),
            ...comparison.pairs.map((pair) =>
              el(ExperiencePair, { key: `pair-${pair.leftIndex}`, pair })
            ),
            ...oneSided(comparison.onlyLeft, 'HH'),
            ...oneSided(comparison.onlyRight, 'LinkedIn'),
            ...comparison.review.map((item) =>
              el(ExperienceJob, {
                key: `review-${item.side}-${item.index}`,
                item,
                review: true,
                platform: item.side === 'hh' ? 'HH' : 'LinkedIn',
              })
            ),
          ]),
    ]
  );
};
