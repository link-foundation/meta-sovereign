// React components that render the connection-guide registry from
// ./connection-guides.js. The split keeps the registry + tryDirect()
// helpers testable in plain Node, while these components render the
// guide inside the SPA empty branches.
//
// Component surface:
//   <ConnectionGuide section="chat" />
//   <LocalServerHelp />               (rendered automatically when a
//                                       provider probe classifies as
//                                       'cors' — R-M6)

import React, { useState } from 'react';
import {
  connectionGuides,
  getGuide,
  getProvider,
  isCrossOrigin,
  localServerHelp,
  providerCatalogue,
  applyLocalServerOverride,
} from './connection-guides.js';
import { useT } from './i18n.js';

const el = React.createElement;

// Translate a registry value using its `*Key` reference when present, falling
// back to the raw English string. This lets the underlying registry keep
// English literals (the existing tests still introspect them) while rendered
// UI prefers the active-locale dictionary entry.
const tx = (t, value, key) => {
  if (key) {
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return value;
};

const ProbeRow = ({ provider }) => {
  const t = useT();
  // R-O1: per-section ProbeRow refuses to fire when no credentials are
  // saved (which would always 404/400 — the original bug). It points
  // the user at Settings → Connections instead.
  const ready = false;
  const placeholder = t('guide.probeDisabled', {
    label: tx(t, provider.label, provider.labelKey),
  });
  return el('div', { className: 'col probe-row' }, [
    el('div', { key: 'row', className: 'row' }, [
      el(
        'button',
        {
          key: 'probe',
          type: 'button',
          className: 'primary',
          disabled: !ready,
        },
        t('settings.probe.button')
      ),
      el('span', { key: 'meta', className: 'meta' }, placeholder),
    ]),
  ]);
};

const ProviderCard = ({ providerId }) => {
  const t = useT();
  const provider = getProvider(providerId);
  return el('section', { className: 'card connection-guide-provider' }, [
    el('h3', { key: 'h' }, tx(t, provider.label, provider.labelKey)),
    el('div', { key: 'archive', className: 'col' }, [
      el(
        'h4',
        { key: 'h', className: 'meta' },
        tx(t, provider.archive.title, provider.archive.titleKey)
      ),
      el(
        'p',
        { key: 'p' },
        tx(t, provider.archive.hint, provider.archive.hintKey)
      ),
      el(
        'div',
        { key: 'fileHint', className: 'meta' },
        t('guide.filesLabel', { hint: provider.archive.fileHint })
      ),
    ]),
    el('div', { key: 'api', className: 'col' }, [
      el(
        'h4',
        { key: 'h', className: 'meta' },
        tx(t, provider.apiCredentials.title, provider.apiCredentials.titleKey)
      ),
      el(
        'p',
        { key: 'p' },
        tx(t, provider.apiCredentials.hint, provider.apiCredentials.hintKey)
      ),
      el(
        'div',
        { key: 'env', className: 'meta' },
        t('guide.envVarLabel', { name: provider.apiCredentials.envVar })
      ),
      el(
        'div',
        { key: 'docs', className: 'meta' },
        el(
          'a',
          {
            href: provider.apiCredentials.docsUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          t('settings.docsLink')
        )
      ),
      el(ProbeRow, { key: 'probe', provider }),
    ]),
  ]);
};

export const LocalServerHelp = () => {
  const t = useT();
  const [override, setOverride] = useState('');
  const apply = () => {
    if (!override) {
      return;
    }
    applyLocalServerOverride(override);
  };
  return el('aside', { className: 'card local-server-help', role: 'note' }, [
    el(
      'h4',
      { key: 'h' },
      tx(t, localServerHelp.title, localServerHelp.titleKey)
    ),
    el('p', { key: 'p' }, tx(t, localServerHelp.body, localServerHelp.bodyKey)),
    ...localServerHelp.options.map((option) =>
      el('div', { key: option.id, className: 'col local-server-help-opt' }, [
        el(
          'div',
          { key: 'h', className: 'meta' },
          tx(t, option.heading, option.headingKey)
        ),
        el('pre', { key: 'cmd' }, option.command),
        el(
          'div',
          { key: 'hint', className: 'meta' },
          tx(t, option.hint, option.hintKey)
        ),
      ])
    ),
    el(
      'div',
      { key: 'override-h', className: 'meta' },
      tx(
        t,
        localServerHelp.manualOverride.hint,
        localServerHelp.manualOverride.hintKey
      )
    ),
    el('div', { key: 'override-row', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'url',
        placeholder: 'http://127.0.0.1:8787',
        value: override,
        onChange: (event) => setOverride(event.target.value),
      }),
      el(
        'button',
        {
          key: 'apply',
          type: 'button',
          className: 'primary',
          onClick: apply,
        },
        t('guide.useThisServer')
      ),
    ]),
  ]);
};

// R-O7: per-section "Connect first" CTA. Renders above the in-place
// guide and deep-links into Settings → Connections, scrolling to the
// matching provider card via the `meta-sovereign:navigate` event that
// app.js listens for.
export const SettingsConnectFirstCta = ({ providerId }) => {
  const t = useT();
  const provider = providerId ? providerCatalogue[providerId] : null;
  const target = provider
    ? t('guide.openSettingsTarget', {
        label: tx(t, provider.label, provider.labelKey),
      })
    : t('guide.openSettingsRoot');
  const navigate = () => {
    const anchor = providerId ? `#conn-${providerId}` : '';
    globalThis.dispatchEvent?.(
      new CustomEvent('meta-sovereign:navigate', {
        detail: { view: 'settings', anchor },
      })
    );
  };
  return el('div', { className: 'connection-guide-connect-first row' }, [
    el('p', { key: 'copy', className: 'meta' }, t('guide.connectFirstHint')),
    el(
      'button',
      {
        key: 'cta',
        type: 'button',
        className: 'primary',
        onClick: navigate,
        'data-action': 'open-settings',
        'data-target-anchor': providerId ? `#conn-${providerId}` : '',
      },
      t('guide.openSettings', { target })
    ),
  ]);
};

export const ConnectionGuide = ({ section }) => {
  const t = useT();
  const guide = connectionGuides[section]
    ? getGuide(section)
    : {
        title: 'Nothing here yet.',
        titleKey: 'guide.fallbackTitle',
        body: '',
        providers: [],
      };
  return el(
    'section',
    {
      className: 'connection-guide',
      'data-connection-guide': section,
      role: 'note',
    },
    [
      el('h2', { key: 'h' }, tx(t, guide.title, guide.titleKey)),
      el('p', { key: 'body' }, tx(t, guide.body, guide.bodyKey)),
      guide.providers.length > 0
        ? el(SettingsConnectFirstCta, {
            key: 'cta',
            providerId: guide.connectFirst?.providerId ?? guide.providers[0],
          })
        : null,
      ...guide.providers.map((id) =>
        el(ProviderCard, { key: id, providerId: id })
      ),
      guide.providers.length === 0
        ? el(LocalServerHelp, { key: 'help' })
        : null,
    ]
  );
};

// Re-exported helper so callers can branch on cross-origin without
// importing the registry directly.
export { isCrossOrigin };
