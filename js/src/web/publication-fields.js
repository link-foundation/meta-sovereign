import React from 'react';
const h = React.createElement;
export const field = (t, key, value, onChange, options = {}) =>
  h('label', { key, className: 'publication-field' }, [
    h('span', { key: 'label' }, t(`publication.${key}`)),
    h('input', {
      key: 'input',
      value,
      onChange: (event) => onChange(event.target.value),
      ...options,
    }),
  ]);
export const choice = (t, key, value, onChange, values) =>
  h('label', { key, className: 'publication-field' }, [
    h('span', { key: 'label' }, t(`publication.${key}`)),
    h(
      'select',
      {
        key: 'input',
        'aria-label': t(`publication.${key}`),
        value,
        onChange: (event) => onChange(event.target.value),
      },
      values.map((item) =>
        h(
          'option',
          { key: item, value: item },
          t(
            ['telegram', 'vk', 'x'].includes(item)
              ? `connections.${item}.label`
              : `publication.option.${item}`
          )
        )
      )
    ),
  ]);
export const toggle = (t, key, checked, onChange, options = {}) =>
  h('label', { key, className: 'publication-toggle' }, [
    h('input', {
      key: 'input',
      type: 'checkbox',
      checked,
      onChange: (event) => onChange(event.target.checked),
      ...options,
    }),
    h('span', { key: 'label' }, t(`publication.${key}`)),
  ]);
export const action = (label, onClick, disabled = false, extra = {}) =>
  h('button', { type: 'button', onClick, disabled, ...extra }, label);
