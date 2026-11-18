import React from 'react';
import { useT } from './i18n.js';
import { getLocalStorage } from '../storage/local-storage.js';
import {
  browserTextDraft,
  saveBrowserTextDraft,
} from './question-browser-text-state.js';

const el = React.createElement;

/** One explicit reviewed reply; native provider drafts remain separately protected. */
export const BrowserTextAnswer = ({ result, blocked, reply }) => {
  const t = useT();
  const [draft, setDraft] = React.useState(() =>
    browserTextDraft(result, getLocalStorage())
  );
  const attempted =
    result.outbox?.answerType === 'text' &&
    ['sending', 'sent', 'unknown'].includes(result.status);
  const text = attempted ? browserTextDraft(result) : draft;
  const disabled =
    blocked || result.hasDraft || result.prefilled || !result.pendingTurn;
  return el(
    'fieldset',
    { className: 'col', disabled, 'data-browser-text-controls': true },
    [
      el('legend', { key: 'legend' }, t('browserText.title')),
      el('p', { key: 'hint', className: 'meta' }, t('browserText.hint')),
      el('label', { key: 'field', className: 'field' }, [
        el(
          'span',
          { key: 'label', className: 'field-label' },
          t('browserText.draft')
        ),
        el('textarea', {
          key: 'input',
          value: text,
          maxLength: 12000,
          rows: 4,
          'data-browser-text-draft': true,
          onChange: (event) => {
            const value = event.target.value;
            setDraft(value);
            saveBrowserTextDraft(result, value, getLocalStorage());
          },
        }),
      ]),
      el(
        'button',
        {
          key: 'send',
          type: 'button',
          className: 'primary',
          disabled: disabled || !text.trim(),
          'data-browser-text-send': true,
          onClick: () => reply({ id: result.id, text, confirm: true }),
        },
        t('browserText.send')
      ),
    ]
  );
};
