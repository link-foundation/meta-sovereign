// Settings view (issue #27).
//
// Provider credentials, archive import, and live probing now belong to
// Connections -> provider detail. Settings stays available for app-level
// preferences and points users to the dedicated connection surface.

import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

export const SettingsView = () => {
  const t = useT();
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
  ]);
};
