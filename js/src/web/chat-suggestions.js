import React from 'react';
import { useT } from './i18n.js';
import { MiddleEllipsis } from './middle-ellipsis.js';

const el = React.createElement;

const Suggestion = ({ suggestion: s, composer, t }) => {
  const word = s.kind === 'word';
  const label = word
    ? (s.word ?? s.insert?.trim() ?? s.text.trim().split(/\s+/u).at(-1))
    : s.text;
  const provenance = word
    ? t('chat.suggest.prediction', { word: label })
    : s.kind === 'context'
      ? t('chat.suggest.context')
      : t('chat.suggest.count', { count: s.count ?? 0 });
  return el(
    'button',
    {
      type: 'button',
      className: 'chip',
      'data-kind': s.kind,
      'data-rule': s.rule,
      'aria-label': word ? provenance : s.text,
      title: word ? `${provenance}\n\n${s.text}` : `${s.text}\n\n${provenance}`,
      onClick: () => composer.setText(s.text),
    },
    el(MiddleEllipsis, { text: label })
  );
};

// Historical messages and generated next words have different provenance.
// A word's frequency never means the constructed whole sentence was sent.
export const Suggestions = ({ suggest, composer }) => {
  const t = useT();
  const { suggestions = [], stage } = suggest;
  if (!suggestions.length) {
    return null;
  }
  const whole = suggestions.filter((s) => s.kind !== 'word');
  const words = suggestions.filter((s) => s.kind === 'word');
  const chip = (s) =>
    el(Suggestion, { key: s.text, suggestion: s, composer, t });
  return el(
    'div',
    {
      className: 'suggestions',
      'data-stage': stage,
      'aria-label': t('chat.suggest.none'),
    },
    [
      whole.length
        ? el(
            'div',
            {
              key: 'messages',
              className: 'suggestion-messages',
              role: 'group',
              'aria-label': t(`chat.suggest.${whole[0].kind ?? stage}`),
            },
            whole.map(chip)
          )
        : null,
      words.length
        ? el(
            'div',
            {
              key: 'words',
              className: 'suggestion-words',
              role: 'group',
              'aria-label': t('chat.suggest.word'),
            },
            [
              el(
                'span',
                {
                  key: 'label',
                  className: 'suggestion-kind',
                  'aria-hidden': true,
                },
                t('chat.suggest.nextWord')
              ),
              ...words.map(chip),
            ]
          )
        : null,
    ]
  );
};
