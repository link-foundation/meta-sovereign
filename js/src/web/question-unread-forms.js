import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

export const UnreadFormOption = ({ value, set, disabled, field }) => {
  const t = useT();
  return el('label', { className: 'check' }, [
    el('input', {
      key: 'input',
      type: 'checkbox',
      checked: value,
      disabled,
      'data-browser-unread-forms': true,
      ...(field ? { 'data-application-batch-field': field } : {}),
      onChange: (event) => set(event.target.checked),
    }),
    t('browserUnread.form.enable'),
  ]);
};

export const UnreadFormResult = ({ form }) => {
  const t = useT();
  if (!form) {
    return null;
  }
  const state = form.code === 'form-session-limit' ? 'slot-limit' : form.state;
  return el(
    'div',
    { className: 'col', 'data-browser-unread-form': form.state },
    [
      el(
        'p',
        { key: 'state', role: 'status' },
        t(`browserUnread.form.${state}`, { count: form.written })
      ),
      form.browserSlot
        ? el(
            'a',
            { key: 'forms', href: '#/forms', className: 'wrap' },
            t('browserUnread.form.open', { slot: form.browserSlot })
          )
        : null,
    ]
  );
};
