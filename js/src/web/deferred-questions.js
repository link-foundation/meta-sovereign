import React, { useState } from 'react';
import { useVacancyRecords } from './vacancy-record-state.js';

const adapter = {
  read: 'vacancyQuestionsStored',
  readOperation: 'questions-stored',
  writeOperation: 'question-change',
  reloadError: 'jobs-question-deferral-reload',
  write: (api, identity, input) =>
    api.vacancyQuestionChange({ ...identity, ...input }),
};
export const useDeferredQuestions = (options) =>
  useVacancyRecords({ ...options, adapter });
const el = React.createElement;
export const DeferredQuestions = ({ state, t }) => {
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState('until-answered');
  const [limit, setLimit] = useState(20);
  const policy = state.questions;
  if (!policy) {
    return null;
  }
  const disabled =
    Boolean(state.busy) ||
    !policy.ready ||
    state.capabilities?.localChoices !== true;
  const entries = policy.snapshot?.entries ?? [];
  const save = async () => {
    const result = await policy.change({ action: 'save', question, mode });
    if (result) {
      setQuestion('');
    }
  };
  return el(
    'section',
    {
      className: 'col',
      'data-deferred-questions': state.values.browserSlot,
      'aria-label': t('deferredQuestions.title'),
    },
    [
      el('h3', { key: 'title' }, t('deferredQuestions.title')),
      el('p', { key: 'hint', className: 'meta' }, t('deferredQuestions.hint')),
      policy.failed
        ? el(
            'p',
            { key: 'failed', role: 'alert' },
            t('deferredQuestions.failed')
          )
        : null,
      el('label', { key: 'question', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('deferredQuestions.question')),
        el('textarea', {
          key: 'input',
          rows: 3,
          maxLength: 6000,
          value: question,
          disabled: Boolean(state.busy),
          'data-deferred-question-input': true,
          onChange: (event) => setQuestion(event.target.value),
        }),
      ]),
      el('label', { key: 'mode', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('deferredQuestions.mode')),
        el(
          'select',
          {
            key: 'input',
            value: mode,
            disabled: Boolean(state.busy),
            onChange: (event) => setMode(event.target.value),
          },
          ['until-answered', 'always'].map((value) =>
            el('option', { key: value, value }, t(`deferredQuestions.${value}`))
          )
        ),
      ]),
      el('div', { key: 'actions', className: 'row wrap' }, [
        el(
          'button',
          {
            key: 'save',
            type: 'button',
            disabled: disabled || !question.trim(),
            'data-deferred-question-save': true,
            onClick: save,
          },
          t('deferredQuestions.save')
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            disabled: Boolean(state.busy) || !state.browserValid,
            onClick: policy.reload,
          },
          t('deferredQuestions.reload')
        ),
      ]),
      ...entries.slice(0, limit).map((row) =>
        el(
          'article',
          { key: row.id, className: 'col', 'data-deferred-question': row.id },
          [
            el(
              'p',
              {
                key: 'question',
                style: { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
              },
              row.question
            ),
            el(
              'p',
              { key: 'mode', className: 'meta' },
              t(`deferredQuestions.${row.mode}`)
            ),
            el(
              'p',
              { key: 'count', className: 'meta' },
              t('deferredQuestions.associations', {
                count: row.vacancies.length,
              })
            ),
            el(
              'button',
              {
                key: 'remove',
                type: 'button',
                disabled,
                onClick: () =>
                  policy.change({ action: 'remove', entryId: row.id }),
              },
              t('deferredQuestions.remove')
            ),
          ]
        )
      ),
      policy.ready && !entries.length
        ? el(
            'p',
            {
              key: 'empty',
              className: 'meta',
              'data-deferred-questions-empty': true,
            },
            t('deferredQuestions.empty')
          )
        : null,
      entries.length > limit
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              onClick: () => setLimit(limit + 20),
            },
            t('deferredQuestions.more')
          )
        : null,
    ]
  );
};
