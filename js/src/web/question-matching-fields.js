import React from 'react';
import { useT } from './i18n.js';
import { normalizeQuestionMatching } from '../automation/question-matching-options.js';

const el = React.createElement;
export const validQuestionMatching = (value) => {
  try {
    normalizeQuestionMatching(value);
    return true;
  } catch {
    return false;
  }
};

export const QuestionMatchingFields = ({ matching, set, disabled = false }) => {
  const t = useT();
  const current = { threshold: 0.78, caseSensitive: false, ...matching };
  return el(
    'fieldset',
    { className: 'col', disabled, 'data-question-matching': '' },
    [
      el('legend', { key: 'legend' }, t('questions.matchingSettings')),
      el('label', { key: 'threshold', className: 'field' }, [
        el(
          'span',
          { key: 'label', className: 'field-label' },
          t('questions.matchingThreshold')
        ),
        el('input', {
          key: 'input',
          type: 'number',
          min: 0,
          max: 100,
          step: 'any',
          required: true,
          value: current.threshold === '' ? '' : current.threshold * 100,
          'aria-label': t('questions.matchingThreshold'),
          onChange: (event) =>
            set({
              ...current,
              threshold:
                event.target.value === ''
                  ? ''
                  : Number(event.target.value) / 100,
            }),
        }),
      ]),
      el('label', { key: 'case', className: 'check' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: current.caseSensitive,
          onChange: (event) =>
            set({ ...current, caseSensitive: event.target.checked }),
        }),
        t('questions.matchingCase'),
      ]),
      el('p', { key: 'hint', className: 'meta' }, t('questions.matchingHint')),
      !validQuestionMatching(matching)
        ? el(
            'p',
            { key: 'error', role: 'alert' },
            t('questions.matchingInvalid')
          )
        : null,
    ]
  );
};
