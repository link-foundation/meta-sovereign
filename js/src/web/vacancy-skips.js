import React, { useState } from 'react';
import { useDates } from './i18n.js';
import { vacancySkipReasons } from '../jobs/vacancy-skip-data.js';

const el = React.createElement;
export const VacancySkips = ({ state, t }) => {
  const [limit, setLimit] = useState(20);
  const { dateTime } = useDates();
  const skips = state.skips;
  if (!skips) {
    return null;
  }
  const entries = skips.snapshot?.entries ?? [];
  const disabled =
    Boolean(state.busy) ||
    !skips.ready ||
    state.capabilities?.localChoices !== true;
  const button = (key, label, action, blocked = disabled) =>
    el(
      'button',
      {
        key,
        type: 'button',
        disabled: blocked,
        'data-vacancy-skip-action': key,
        onClick: action,
      },
      t(`vacancySkip.${label}`)
    );
  return el(
    'section',
    {
      className: 'col',
      'data-vacancy-skips': state.values.browserSlot,
      'aria-label': t('vacancySkip.title'),
    },
    [
      el('h3', { key: 'title' }, t('vacancySkip.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vacancySkip.hint')),
      skips.failed
        ? el('p', { key: 'failed', role: 'alert' }, t('vacancySkip.failed'))
        : null,
      button(
        'reload',
        'reload',
        skips.reload,
        Boolean(state.busy) || !state.browserValid
      ),
      ...vacancySkipReasons
        .filter((reason) => entries.some((row) => row.reason === reason))
        .map((reason) =>
          button(`clear-${reason}`, `clear-${reason}`, () =>
            skips.change({ reason })
          )
        ),
      ...entries.slice(0, limit).map((row) =>
        el(
          'article',
          {
            key: row.url,
            className: 'col',
            'data-vacancy-skip': row.url,
          },
          [
            el(
              'a',
              {
                key: 'url',
                href: row.url,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              row.title || row.url
            ),
            el(
              'p',
              { key: 'reason', className: 'meta' },
              t(`vacancySkip.${row.reason}`)
            ),
            el(
              'p',
              { key: 'time', className: 'meta' },
              t('vacancySkip.observed', {
                date: dateTime(row.time),
                attempts: row.attempts,
              })
            ),
            row.externalUrl
              ? el(
                  'a',
                  {
                    key: 'external',
                    href: row.externalUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  },
                  t('vacancySkip.externalLink')
                )
              : null,
            row.prefillCommand
              ? el(
                  'code',
                  {
                    key: 'prefill',
                    style: { overflowWrap: 'anywhere' },
                  },
                  row.prefillCommand
                )
              : null,
            button(`clear:${row.url}`, 'clear', () =>
              skips.change({ url: row.url })
            ),
          ]
        )
      ),
      skips.ready && !entries.length
        ? el(
            'p',
            {
              key: 'empty',
              className: 'meta',
              'data-vacancy-skip-empty': true,
            },
            t('vacancySkip.empty')
          )
        : null,
      entries.length > limit
        ? button('more', 'more', () => setLimit(limit + 20), false)
        : null,
    ]
  );
};
