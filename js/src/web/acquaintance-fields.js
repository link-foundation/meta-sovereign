import React from 'react';
import { useT } from './i18n.js';
const el = React.createElement;
export const AcquaintanceFields = ({ form, set, error, Input }) => {
  const t = useT();
  return el('div', { 'data-acquaintance-catalog': true }, [
    el('p', { key: 'hint', className: 'meta' }, t('acquaintance.catalogHint')),
    ...['Informal', 'Formal'].map((key) =>
      el(Input, {
        key,
        form,
        set,
        error,
        name: `alternative${key}`,
        multiline: 4,
        label: t(`acquaintance.alternative${key}`),
      })
    ),
  ]);
};
