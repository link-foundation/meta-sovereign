import React from 'react';
import { useDates } from './i18n.js';
import { chooseSearchResume } from '../jobs/resume-list.js';

const el = React.createElement;
export const VacancyResumes = ({ state, t }) => {
  const { dateTime } = useDates();
  const list = state.resumeLists?.find(
    (row) => row.browserSlot === state.values.browserSlot
  );
  const choice = list
    ? chooseSearchResume(list, { resumeLanguage: state.values.resumeLanguage })
    : null;
  return el(
    'section',
    {
      className: 'col',
      'data-vacancy-resumes': true,
      'aria-label': t('vacancy.resumes'),
    },
    [
      el('h3', { key: 'title' }, t('vacancy.resumes')),
      el('p', { key: 'hint', className: 'meta' }, t('vacancy.resumesHint')),
      el(
        'button',
        {
          key: 'read',
          type: 'button',
          'data-vacancy-action': 'resumes',
          onClick: state.readResumes,
          disabled:
            Boolean(state.busy) ||
            state.capabilities?.resumes !== true ||
            !state.browserValid,
        },
        t('vacancy.readResumes')
      ),
      list
        ? el(
            'p',
            { key: 'captured', className: 'meta' },
            t('vacancy.resumesCaptured', { date: dateTime(list.capturedAt) })
          )
        : null,
      choice?.hash
        ? el(
            'button',
            {
              key: 'suggested',
              type: 'button',
              'data-vacancy-action': 'resume-suggested',
              disabled: Boolean(state.busy),
              onClick: () => state.selectResume(choice.hash),
            },
            t('vacancy.resumeSuggested', {
              title: list.entries.find((row) => row.hash === choice.hash).title,
              reason: t(`vacancy.resumeReason.${choice.reason}`),
            })
          )
        : null,
      list && !list.entries.length
        ? el('p', { key: 'empty', role: 'status' }, t('vacancy.resumesEmpty'))
        : null,
      ...(list?.entries ?? []).map((row) =>
        el(
          'article',
          {
            key: row.hash,
            className: 'col',
            'data-vacancy-resume': row.hash,
          },
          [
            el(
              'a',
              {
                key: 'title',
                href: row.url,
                target: '_blank',
                rel: 'noreferrer',
              },
              row.title
            ),
            el(
              'p',
              { key: 'updated', className: 'meta' },
              row.updatedAt === null
                ? t('vacancy.resumeUnknownDate')
                : dateTime(row.updatedAt)
            ),
            el(
              'button',
              {
                key: 'select',
                type: 'button',
                'data-vacancy-action': 'resume-select',
                disabled: Boolean(state.busy),
                'aria-pressed': state.values.resume === row.hash,
                onClick: () => state.selectResume(row.hash),
              },
              state.values.resume === row.hash
                ? t('vacancy.resumeSelected')
                : t('vacancy.resumeUse')
            ),
          ]
        )
      ),
    ]
  );
};
