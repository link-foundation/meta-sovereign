// Settings view (issue #27).
//
// Provider credentials, archive import, and live probing now belong to
// Connections -> provider detail. Settings stays available for app-level
// preferences — the appearance (issue #31 / PR #34: theme mode and skin)
// — and points users to the dedicated connection surface.

import React from 'react';
import { useT } from './i18n.js';
import { SKINS, THEME_MODES, useAppearance } from './appearance.js';
import { useShareTyping } from './privacy-prefs.js';

const el = React.createElement;

const Choices = ({ name, legend, options, value, onChange, label }) =>
  el('fieldset', { className: 'appearance-choices' }, [
    el('legend', { key: 'l' }, legend),
    ...options.map((option) =>
      el('label', { key: option, className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name,
          value: option,
          checked: value === option,
          'data-action': name,
          onChange: () => onChange(option),
        }),
        ` ${label(option)}`,
      ])
    ),
  ]);

/** Theme mode (system, light, dark, auto) and skin (t3, Telegram, …). */
export const AppearanceSettings = ({ appearance }) => {
  const t = useT();
  return el(
    'section',
    { className: 'card appearance', 'aria-labelledby': 'appearance-title' },
    [
      el(
        'h3',
        { key: 'h', id: 'appearance-title' },
        t('settings.appearance.title')
      ),
      el('p', { key: 'p', className: 'meta' }, t('settings.appearance.intro')),
      el(
        'div',
        { key: 'c', className: 'row appearance-row' },
        el(Choices, {
          key: 'theme',
          name: 'theme-mode',
          legend: t('settings.appearance.theme'),
          options: THEME_MODES,
          value: appearance.mode,
          onChange: appearance.setMode,
          label: (mode) => t(`settings.theme.${mode}`),
        }),
        el(Choices, {
          key: 'skin',
          name: 'skin',
          legend: t('settings.appearance.skin'),
          options: SKINS,
          value: appearance.skin,
          onChange: appearance.setSkin,
          label: (skin) => t(`settings.skin.${skin}`),
        })
      ),
    ]
  );
};

/** What other people may see; everything here is off by default. */
export const PrivacySettings = () => {
  const t = useT();
  const [shareTyping, setShareTyping] = useShareTyping();
  return el(
    'section',
    { className: 'card privacy', 'aria-labelledby': 'privacy-title' },
    [
      el('h3', { key: 'h', id: 'privacy-title' }, t('settings.privacy.title')),
      el('label', { key: 'typing', className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          checked: shareTyping,
          'data-action': 'share-typing',
          onChange: (event) => setShareTyping(event.target.checked),
        }),
        ` ${t('settings.shareTyping')}`,
      ]),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t('settings.shareTypingHint')
      ),
    ]
  );
};

export const SettingsView = () => {
  const t = useT();
  const appearance = useAppearance();
  const navigate = () => {
    globalThis.dispatchEvent?.(
      new CustomEvent('meta-sovereign:navigate', {
        detail: { view: 'connections', anchor: '' },
      })
    );
  };

  return el('div', { className: 'col settings-view' }, [
    el('h2', { key: 'h' }, t('settings.title')),
    el('p', { key: 'intro', className: 'meta' }, t('settings.intro')),
    el(
      'button',
      {
        key: 'connections',
        type: 'button',
        className: 'primary',
        onClick: navigate,
        'data-action': 'open-connections',
      },
      t('settings.openConnections')
    ),
    el(AppearanceSettings, { key: 'appearance', appearance }),
    el(PrivacySettings, { key: 'privacy' }),
  ]);
};
