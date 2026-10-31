import React, { useState } from 'react';
import { useT } from './i18n.js';
import { useFeedbackRead } from './feedback-read.js';
import { openFeedbackMessage, feedbackEmoji } from './feedback-navigation.js';
import { readConversationSettings } from './conversation-prefs.js';

const el = React.createElement;

export const PersonReactions = ({ api, source, peer }) => {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const learning = readConversationSettings();
  const enabled = Boolean(
    source && peer && api?.feedbackPerson && learning.enabled && learning.facts
  );
  const { data } = useFeedbackRead(
    () => api.feedbackPerson(source, String(peer), { offset, limit: 25 }),
    `person-reactions:${source}:${peer}:${offset}`,
    enabled
  );
  if (!enabled || !data?.items?.length || data.disabled) {
    return null;
  }
  return el(
    'section',
    {
      className: 'person-section person-reactions',
      'data-person-reactions': '',
    },
    [
      el('h3', { key: 'h' }, t('feedback.person.title')),
      el('p', { key: 'hint', className: 'meta' }, t('feedback.person.hint')),
      ...data.items.map(({ message, reactions }) =>
        el('div', { key: message.id, className: 'reaction-evidence' }, [
          el(
            'p',
            { key: 'text' },
            t('feedback.person.observed', {
              emoji: [
                ...new Set(reactions.map((one) => feedbackEmoji(one.emoji))),
              ].join(' '),
              text: message.text.slice(0, 180) || t('feedback.media'),
            })
          ),
          el(
            'button',
            {
              key: 'go',
              type: 'button',
              className: 'ghost',
              'data-action': 'reaction-evidence',
              onClick: () => openFeedbackMessage(message),
            },
            t('feedback.viewMessage')
          ),
        ])
      ),
      offset || data.next !== null
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
    ]
  );
};
