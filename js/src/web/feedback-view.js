import React, { useMemo, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useDates, useT } from './i18n.js';
import { PageLoading } from './spinner.js';
import { SelectField } from './settings-fields.js';
import { useFeedbackRead } from './feedback-read.js';
import { FeedbackAuthors } from './feedback-authors.js';
import { openFeedbackMessage, feedbackEmoji } from './feedback-navigation.js';

const el = React.createElement;

const FeedbackCard = ({ message, rank, authors }) => {
  const t = useT();
  const dates = useDates();
  return el(
    'article',
    { className: 'card feedback-card', 'data-feedback-message': message.id },
    [
      el('header', { key: 'h', className: 'row' }, [
        el('strong', { key: 'rank', className: 'feedback-rank' }, `#${rank}`),
        el('strong', { key: 'name' }, message.name),
        el('span', { key: 'provider', className: 'meta' }, message.source),
        message.at
          ? el(
              'time',
              { key: 'date', className: 'meta', dateTime: message.at },
              dates.dateTime(message.at)
            )
          : null,
      ]),
      el(
        'p',
        { key: 'text', className: 'feedback-text' },
        message.text || t('feedback.media')
      ),
      el(
        'div',
        { key: 'reactions', className: 'row feedback-reactions' },
        message.reactions.map((row) =>
          el(
            'button',
            {
              key: row.emoji,
              type: 'button',
              className: 'ghost',
              onClick: authors,
            },
            `${feedbackEmoji(row.emoji)} ${row.count}`
          )
        )
      ),
      el('footer', { key: 'actions', className: 'row' }, [
        el(
          'span',
          { key: 'total', className: 'meta' },
          t('feedback.total', { count: message.total })
        ),
        el(
          'button',
          {
            key: 'go',
            type: 'button',
            className: 'ghost',
            'data-action': 'feedback-open-message',
            onClick: () => openFeedbackMessage(message),
          },
          t('feedback.viewMessage')
        ),
        el(
          'button',
          {
            key: 'authors',
            type: 'button',
            className: 'ghost',
            'data-action': 'feedback-authors',
            onClick: authors,
          },
          t('feedback.authors.button', { count: message.knownAuthors })
        ),
      ]),
    ]
  );
};

export const FeedbackView = ({ api = defaultApi }) => {
  const t = useT();
  const [source, setSource] = useState('');
  const [period, setPeriod] = useState('all');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('score');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const since = useMemo(
    () =>
      period === 'all'
        ? ''
        : new Date(Date.now() - Number(period) * 86400000).toISOString(),
    [period]
  );
  const options = { source, since, scope, sort, offset, limit: 25, mine: '1' };
  const state = useFeedbackRead(
    () => api.feedback(options),
    JSON.stringify(options)
  );
  const data = state.data;
  const choose = (set) => (value) => {
    setOffset(0);
    set(value);
  };
  const control = (key, value, items, set) =>
    el(SelectField, {
      key,
      action: `feedback-${key}`,
      label: t(`feedback.filter.${key}`),
      value,
      options: items,
      text: (item) =>
        key === 'source' && item
          ? item
          : t(`feedback.option.${item || 'providers'}`),
      onChange: choose(set),
    });
  return el('div', { className: 'col feedback-view' }, [
    el('h2', { key: 'title' }, t('feedback.title')),
    el('p', { key: 'intro', className: 'meta' }, t('feedback.intro')),
    el('div', { key: 'filters', className: 'row feedback-filters' }, [
      control(
        'source',
        source,
        [
          ...new Set([
            '',
            ...(source ? [source] : []),
            ...(data?.sources ?? []),
          ]),
        ],
        setSource
      ),
      control('period', period, ['all', '7', '30', '365'], setPeriod),
      control('scope', scope, ['all', 'shared'], setScope),
      control('sort', sort, ['score', 'recent'], setSort),
    ]),
    state.loading ? el(PageLoading, { key: 'loading' }) : null,
    data?.items.length === 0
      ? el('section', { key: 'empty', className: 'card feedback-empty' }, [
          el('h3', { key: 'h' }, t('feedback.empty')),
          el('p', { key: 'p', className: 'meta' }, t('feedback.coverage')),
        ])
      : null,
    ...(data?.items ?? []).map((message, index) =>
      el(FeedbackCard, {
        key: message.id,
        message,
        rank: offset + index + 1,
        authors: () => setSelected(message),
      })
    ),
    data && (offset > 0 || data.next !== null)
      ? el('div', { key: 'pages', className: 'row' }, [
          el(
            'button',
            {
              key: 'prev',
              type: 'button',
              disabled: offset === 0,
              onClick: () => setOffset(Math.max(0, offset - 25)),
            },
            t('feedback.previous')
          ),
          el(
            'button',
            {
              key: 'next',
              type: 'button',
              disabled: data.next === null,
              onClick: () => setOffset(data.next),
            },
            t('feedback.next')
          ),
        ])
      : null,
    el('p', { key: 'coverage', className: 'meta' }, t('feedback.coverage')),
    selected
      ? el(FeedbackAuthors, {
          key: `authors:${selected.id}`,
          api,
          message: selected,
          close: () => setSelected(null),
        })
      : null,
  ]);
};
