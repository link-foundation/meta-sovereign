import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const FormReviewCapacity = ({ listing, busy, run }) => {
  const t = useT();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (listing) {
      setValue(String(listing.maxSessions));
    }
  }, [listing?.maxSessions, listing?.revision]);
  const number = Number(value);
  const valid = Number.isSafeInteger(number) && number > 0;
  return el('div', { className: 'col', 'data-form-capacity': '' }, [
    el('label', { key: 'label', className: 'col' }, [
      t('forms.capacity.label'),
      el('input', {
        key: 'input',
        type: 'number',
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        step: 1,
        inputMode: 'numeric',
        value,
        disabled: busy || !listing,
        'data-form-capacity-value': '',
        onChange: (event) => setValue(event.target.value),
      }),
    ]),
    el('p', { key: 'hint', className: 'meta' }, t('forms.capacity.hint')),
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled: busy || !listing || !valid || number === listing.maxSessions,
        'data-action': 'save-form-capacity',
        onClick: () =>
          run('Capacity', { maxSessions: number, revision: listing.revision }),
      },
      t('forms.capacity.save')
    ),
  ]);
};
