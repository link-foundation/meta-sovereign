// Header language switcher (issue #18). Sits next to the theme toggle
// and lets users pick a UI language explicitly. The "system default"
// option clears the stored override so detection falls back to
// `navigator.languages` again.
//
// The component is intentionally a plain `<select>` so screen readers
// announce it correctly, the keyboard interaction matches the rest of
// the SPA's controls, and the bundle stays under the
// no-runtime-dependencies budget set in
// docs/case-studies/issue-18/components.md.

import React from 'react';
import { useLocaleContext } from './i18n.js';

const el = React.createElement;

const SYSTEM_VALUE = '__system__';

export const LanguageSwitcher = () => {
  const { locale, setLocale, clearLocale, t, available } = useLocaleContext();
  const onChange = (event) => {
    const value = event.target.value;
    if (value === SYSTEM_VALUE) {
      clearLocale();
      return;
    }
    setLocale(value);
  };
  return el(
    'label',
    {
      className: 'language-switcher',
      'data-action': 'language-switcher',
    },
    [
      el(
        'span',
        { key: 'label', className: 'sr-only' },
        t('header.languageAria')
      ),
      el(
        'select',
        {
          key: 'select',
          value: locale,
          onChange,
          'aria-label': t('header.languageAria'),
          title: t('header.language'),
          'data-locale': locale,
        },
        [
          el(
            'option',
            { key: SYSTEM_VALUE, value: SYSTEM_VALUE },
            t('header.systemDefault')
          ),
          ...available.map((entry) =>
            el('option', { key: entry.id, value: entry.id }, entry.label)
          ),
        ]
      ),
    ]
  );
};
