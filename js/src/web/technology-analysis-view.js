import React, { useState } from 'react';
import { useDates } from './i18n.js';

const el = React.createElement;
const list = (key, values, t) =>
  el('p', { key }, `${t(`technology.${key}`)}: ${values.join(' · ') || '—'}`);
const Evidence = ({ analysis, t }) => {
  const [offset, setOffset] = useState(0);
  const evidence = analysis.evidence;
  return el('details', { key: 'evidence', 'data-technology-evidence': true }, [
    el(
      'summary',
      { key: 'summary' },
      `${t('technology.evidence')} (${evidence.length})`
    ),
    el(
      'ul',
      { key: 'items' },
      evidence
        .slice(offset, offset + 20)
        .map((item, i) =>
          el(
            'li',
            { key: offset + i },
            `${item.field} · ${item.start}–${item.end} · ${item.spelling} → ${item.candidates.join(' / ')} · ${item.context}`
          )
        )
    ),
    el('div', { key: 'pages', className: 'row' }, [
      el(
        'button',
        {
          key: 'previous',
          type: 'button',
          disabled: offset === 0,
          onClick: () => setOffset(offset - 20),
        },
        t('vacancy.previous')
      ),
      el(
        'span',
        { key: 'count', className: 'meta' },
        `${Math.min(offset + 1, evidence.length)}–${Math.min(offset + 20, evidence.length)} / ${evidence.length}`
      ),
      el(
        'button',
        {
          key: 'next',
          type: 'button',
          disabled: offset + 20 >= evidence.length,
          onClick: () => setOffset(offset + 20),
        },
        t('vacancy.next')
      ),
    ]),
  ]);
};
const VacancyComparison = ({ vacancy, t }) =>
  el('article', { className: 'col', 'data-technology-vacancy': vacancy.url }, [
    el(
      'h4',
      { key: 'title' },
      el(
        'a',
        { href: vacancy.url, target: '_blank', rel: 'noreferrer' },
        vacancy.title
      )
    ),
    ...['mentioned', 'missing', 'requiredMissing', 'preferredMissing'].map(
      (key) => list(key, vacancy.comparison[key], t)
    ),
    list('unrecognized', vacancy.unrecognizedSkills, t),
    list(
      'aliasSuggestions',
      vacancy.comparison.aliasSuggestions.map(
        (item) => `${item.canonical}: ${item.spelling}`
      ),
      t
    ),
    list(
      'spellingSuggestions',
      vacancy.comparison.spellingSuggestions.map(
        (item) => `${item.spelling} → ${item.candidates.join(' / ')}`
      ),
      t
    ),
    el('details', { key: 'mentions' }, [
      el('summary', { key: 'summary' }, t('technology.vacancyEvidence')),
      ...vacancy.mentions.map((item, i) =>
        el(
          'p',
          { key: i, className: 'meta' },
          `${t(`technology.${item.requirement}`)} · ${item.spelling} → ${item.candidates.join(' / ')}${item.candidates.length > 1 ? ` (${t('technology.ambiguous')})` : ''} · ${item.context}`
        )
      ),
    ]),
    el('details', { key: 'prose' }, [
      el('summary', { key: 'summary' }, t('technology.prose')),
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
        vacancy.description
      ),
    ]),
  ]);
export const TechnologyAnalysisView = ({ analysis, catalog, t }) => {
  const { dateTime } = useDates();
  const [index, setIndex] = useState(0);
  const vacancy = analysis.vacancies[index];
  return el(
    'div',
    {
      className: 'col',
      'data-technology-report': analysis.fingerprint,
      style: { overflowWrap: 'anywhere', minWidth: 0 },
    },
    [
      el(
        'p',
        { key: 'date', className: 'meta' },
        `${t('technology.saved')} · ${dateTime(analysis.capturedAt)} · ${analysis.resume.title} · ${analysis.resume.hash} · ${analysis.resume.language.toUpperCase()}`
      ),
      el(
        'p',
        { key: 'source', className: 'meta' },
        `${t('technology.provenance')} · ${analysis.resume.exportId} · ${dateTime(analysis.resume.capturedAt)} · ${analysis.resume.sha256}`
      ),
      catalog?.revision !== analysis.catalogRevision
        ? el('p', { key: 'stale', role: 'status' }, t('technology.stale'))
        : null,
      el('details', { key: 'stats', 'data-technology-statistics': true }, [
        el(
          'summary',
          { key: 'summary' },
          `${t('technology.statistics')} (${analysis.vacancies.length})`
        ),
        ...analysis.statistics.map((item) =>
          el(
            'p',
            { key: item.canonical },
            `${item.canonical}: ${item.vacancies} · ${t('technology.required')} ${item.required} · ${t('technology.preferred')} ${item.preferred} · ${item.spellings.map((name) => `${name.value} (${name.count})`).join(' · ')}`
          )
        ),
        ...Object.entries(analysis.metadata).map(([key, values]) =>
          list(
            `metadata.${key}`,
            values.map((item) => `${item.value} (${item.count})`),
            t
          )
        ),
      ]),
      el(Evidence, { key: 'evidence', analysis, t }),
      el('label', { key: 'select', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('technology.vacancy')),
        el(
          'select',
          {
            key: 'input',
            'data-technology-field': 'vacancy',
            value: index,
            onChange: (event) => setIndex(Number(event.target.value)),
          },
          analysis.vacancies.map((row, i) =>
            el(
              'option',
              { key: row.url, value: i },
              `${row.company} · ${row.title}`
            )
          )
        ),
      ]),
      vacancy
        ? el(VacancyComparison, { key: vacancy.url, vacancy, t })
        : el('p', { key: 'empty' }, t('vacancy.empty')),
    ]
  );
};
