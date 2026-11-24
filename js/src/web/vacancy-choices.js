import React, { useState } from 'react';

const el = React.createElement;
export const VacancyChoiceControls = ({ state, card, t }) => {
  const [draft, setDraft] = useState(null);
  const choices = state.choices;
  if (!choices) {
    return null;
  }
  const choice = choices.snapshot?.entries.find((row) => row.url === card.url);
  const note = draft ?? choice?.note ?? '';
  const disabled =
    Boolean(state.busy) ||
    !choices.ready ||
    state.capabilities?.localChoices !== true;
  return el(
    'div',
    { className: 'col', 'data-vacancy-choice-controls': card.url },
    [
      choice
        ? el(
            'p',
            {
              key: 'status',
              className: 'meta',
              'data-vacancy-choice-state': choice.state,
            },
            t(`vacancyChoice.${choice.state}`)
          )
        : null,
      el('label', { key: 'note', className: 'chat-form-field' }, [
        el(
          'span',
          { key: 'label', className: 'meta' },
          t('vacancyChoice.note')
        ),
        el('textarea', {
          key: 'input',
          value: note,
          maxLength: 4000,
          rows: 2,
          disabled,
          'data-vacancy-choice-note': true,
          onChange: (event) => setDraft(event.target.value),
        }),
      ]),
      el('div', { key: 'actions', className: 'row' }, [
        ...['skipped', 'deferred'].map((kind) =>
          el(
            'button',
            {
              key: kind,
              type: 'button',
              disabled,
              'data-vacancy-choice-action': kind,
              onClick: () => choices.change(card, kind, note),
            },
            t(`vacancyChoice.${kind}Action`)
          )
        ),
        choice
          ? el(
              'button',
              {
                key: 'clear',
                type: 'button',
                disabled,
                'data-vacancy-choice-action': 'clear',
                onClick: () => choices.change(card, null),
              },
              t('vacancyChoice.clear')
            )
          : null,
      ]),
    ]
  );
};

export const VacancyChoices = ({ state, t }) => {
  const [limit, setLimit] = useState(20);
  const choices = state.choices;
  if (!choices) {
    return null;
  }
  return el(
    'section',
    {
      className: 'col',
      'data-vacancy-choices': state.values.browserSlot,
      'aria-label': t('vacancyChoice.title'),
    },
    [
      el('h3', { key: 'title' }, t('vacancyChoice.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vacancyChoice.hint')),
      choices.failed
        ? el('p', { key: 'failed', role: 'alert' }, t('vacancyChoice.failed'))
        : null,
      el(
        'button',
        {
          key: 'reload',
          type: 'button',
          disabled: Boolean(state.busy) || !state.browserValid,
          'data-vacancy-choice-action': 'reload',
          onClick: choices.reload,
        },
        t('vacancyChoice.reload')
      ),
      ...(choices.snapshot?.entries ?? []).slice(0, limit).map((card) =>
        el(
          'article',
          {
            key: `${state.values.browserSlot}:${card.url}`,
            className: 'col',
            'data-saved-vacancy-choice': card.url,
          },
          [
            el(
              'a',
              {
                key: 'title',
                href: card.url,
                target: '_blank',
                rel: 'noreferrer',
              },
              card.title
            ),
            el(VacancyChoiceControls, { key: 'controls', state, card, t }),
          ]
        )
      ),
      choices.ready && !choices.snapshot?.entries.length
        ? el('p', { key: 'empty', className: 'meta' }, t('vacancyChoice.empty'))
        : null,
      choices.snapshot?.entries.length > limit
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              onClick: () => setLimit(limit + 20),
            },
            t('vacancyChoice.more')
          )
        : null,
    ]
  );
};
