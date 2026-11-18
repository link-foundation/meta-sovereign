import React from 'react';

const el = React.createElement;
export const SalaryField = ({ label, value, change, ...props }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'l', className: 'field-label' }, label),
    el('input', {
      key: 'i',
      'aria-label': label,
      value: value ?? '',
      onChange: (event) => change(event.target.value),
      ...props,
    }),
  ]);
export const SalaryCheck = ({ label, value, change }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked: value === true,
      onChange: (event) => change(event.target.checked),
    }),
    ` ${label}`,
  ]);
export const SalarySelect = ({ label, value, change, options }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'l', className: 'field-label' }, label),
    el(
      'select',
      {
        key: 's',
        'aria-label': label,
        value,
        onChange: (event) => change(event.target.value),
      },
      options.map(([code, name]) =>
        el('option', { key: code, value: code }, name)
      )
    ),
  ]);
