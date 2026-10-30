import React from 'react';
const el = React.createElement;
export const PersonContext = ({ learned, t, onGo }) => {
  const topics = learned.summary?.topics ?? [];
  const relationships = learned.relationships ?? [];
  const threads = learned.summary?.continuations ?? [];
  if (!topics.length && !relationships.length) {
    return null;
  }
  return el('section', { className: 'person-section person-context' }, [
    el('h3', { key: 'title' }, t('chat.about.context')),
    topics.length
      ? el(
          'p',
          { key: 'topics', className: 'meta' },
          topics.map((topic) => t(`chat.about.topic.${topic}`)).join(' · ')
        )
      : null,
    ...threads.map((thread, index) =>
      el('div', { key: `thread-${index}`, className: 'row' }, [
        el(
          'span',
          { key: 'text' },
          `${t(`chat.about.topic.${thread.from}`)} → ${t(
            thread.network
              ? `chat.about.network.${thread.network}`
              : `chat.about.topic.${thread.to}`
          )}`
        ),
        onGo
          ? el(
              'button',
              {
                key: 'go',
                type: 'button',
                className: 'ghost',
                'data-action': 'conversation-thread',
                onClick: () => onGo(thread.evidence.at(-1)),
              },
              t('chat.about.evidence')
            )
          : null,
      ])
    ),
    ...relationships.map((fact) =>
      el('div', { key: fact.kind, className: 'row' }, [
        el(
          'span',
          { key: 'text' },
          t(`chat.about.relationship.${fact.kind}.${fact.status}`)
        ),
        onGo && fact.evidence?.length
          ? el(
              'button',
              {
                key: 'evidence',
                type: 'button',
                className: 'ghost',
                'data-action': 'conversation-evidence',
                onClick: () => onGo(fact.evidence.at(-1)),
              },
              t('chat.about.evidence')
            )
          : null,
      ])
    ),
  ]);
};
