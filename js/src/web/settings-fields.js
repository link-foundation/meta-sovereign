// The two controls Settings sections share (R-Y215): a labelled check box
// and a labelled select, each with the `data-action` the tests find it by.

import React from 'react';

const el = React.createElement;

export const Check = ({ action, checked, onChange, label, disabled }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked,
      disabled,
      'data-action': action,
      onChange: (event) => onChange(event.target.checked),
    }),
    ` ${label}`,
  ]);

/** A select of `options` (their values), `text(option)` the words; a change
 * is given to `onChange` as the option itself (numbers stay numbers). */
export const SelectField = ({
  action,
  label,
  value,
  options,
  text,
  onChange,
}) =>
  el('label', { className: 'media-limit' }, [
    el('span', { key: 'l' }, label),
    el(
      'select',
      {
        key: 's',
        'data-action': action,
        value,
        onChange: (event) =>
          onChange(
            options.find((o) => String(o) === event.target.value) ??
              event.target.value
          ),
      },
      options.map((o) => el('option', { key: o, value: o }, text(o)))
    ),
  ]);
