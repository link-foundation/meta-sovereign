import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const ProfileValues = ({ profile = {}, set }) => {
  const t = useT();
  const [newKey, setNewKey] = React.useState('');
  return el('div', { className: 'col', 'data-profile-values': true }, [
    ...Object.entries(profile).map(([key, value]) =>
      el('div', { key: `field:${key}`, className: 'field' }, [
        el('span', { key: 'l', className: 'field-label' }, key),
        el('textarea', {
          key: 'v',
          rows: 2,
          'aria-label': key,
          value,
          onChange: (event) => set({ ...profile, [key]: event.target.value }),
        }),
        el(
          'button',
          {
            key: 'd',
            type: 'button',
            onClick: () =>
              set(
                Object.fromEntries(
                  Object.entries(profile).filter(([name]) => name !== key)
                )
              ),
          },
          t('questions.removeField')
        ),
      ])
    ),
    el('div', { key: 'add', className: 'row' }, [
      el('input', {
        key: 'k',
        value: newKey,
        'aria-label': t('questions.fieldName'),
        placeholder: t('questions.fieldName'),
        onChange: (event) => setNewKey(event.target.value),
      }),
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          disabled:
            !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u.test(newKey) ||
            Object.hasOwn(profile, newKey),
          onClick: () => {
            set({ ...profile, [newKey]: '' });
            setNewKey('');
          },
        },
        t('questions.addField')
      ),
    ]),
  ]);
};
