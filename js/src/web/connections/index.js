// Dedicated Connections module (issue #25 R-N4..R-N8).
//
// `ConnectionsList` renders one card per catalogued provider with:
//   * translated provider label (provider.labelKey)
//   * translated state badge (connected / not-connected / action-required)
//   * "Open" affordance that calls `onOpen(providerId)` so the host app
//     can navigate to the per-provider detail screen.
//
// `ConnectionDetail` receives a `providerId`, reads the matching
// setupSteps[] from `./setup-steps.js`, and renders one numbered
// instruction card per step.
//
// `classifyConnectionState(status, providerId)` is the pure decision
// helper exported separately so tests can pin the rules without
// rendering the components.

import React from 'react';
import { useT } from '../i18n.js';
import { providerCatalogue } from '../connection-guides.js';
import { providerSetupSteps } from './setup-steps.js';

const el = React.createElement;

const tx = (t, value, key) => {
  if (key) {
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return value;
};

// Determine which secret IDs the provider expects, so we can detect
// whether the user has saved at least one of them.
const expectedSecretIds = (providerId) => {
  const provider = providerCatalogue[providerId];
  if (!provider) {
    return [];
  }
  const fields = provider.apiCredentials?.fields ?? [];
  return fields.map((field) => field.secretId).filter(Boolean);
};

export const classifyConnectionState = (status, providerId) => {
  const saved = new Set(status?.savedSecretIds ?? []);
  const expected = expectedSecretIds(providerId);
  const lastProbe = status?.lastProbe;
  if (expected.some((id) => saved.has(id))) {
    return 'connected';
  }
  if (
    lastProbe &&
    lastProbe.providerId === providerId &&
    lastProbe.ok === false
  ) {
    return 'action-required';
  }
  return 'not-connected';
};

const STATE_LABEL_KEY = {
  connected: 'connections.state.connected',
  'not-connected': 'connections.state.notConnected',
  'action-required': 'connections.state.actionRequired',
};

const StateBadge = ({ state }) => {
  const t = useT();
  return el(
    'span',
    {
      className: `connections-state connections-state-${state}`,
      'data-state': state,
    },
    t(STATE_LABEL_KEY[state])
  );
};

const ProviderCard = ({ providerId, status, onOpen }) => {
  const t = useT();
  const provider = providerCatalogue[providerId];
  const state = classifyConnectionState(status, providerId);
  return el(
    'article',
    {
      className: 'card connections-card glass',
      'data-provider-id': providerId,
      'data-tutorial-id': `connections:${providerId}`,
    },
    [
      el('header', { key: 'h', className: 'row connections-card-header' }, [
        el('h3', { key: 'label' }, tx(t, provider.label, provider.labelKey)),
        el(StateBadge, { key: 'badge', state }),
      ]),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        tx(t, provider.archive.hint, provider.archive.hintKey)
      ),
      el(
        'button',
        {
          key: 'open',
          type: 'button',
          className: 'primary',
          'data-action': 'open-connection-detail',
          'data-target-provider': providerId,
          onClick: () => onOpen?.(providerId),
        },
        t('connections.openDetail')
      ),
    ]
  );
};

export const ConnectionsList = ({ status, onOpen }) => {
  const t = useT();
  return el('section', { className: 'connections-list' }, [
    el('header', { key: 'h', className: 'connections-list-header' }, [
      el('h2', { key: 'title' }, t('connections.title')),
      el('p', { key: 'intro', className: 'meta' }, t('connections.intro')),
    ]),
    el(
      'div',
      { key: 'grid', className: 'connections-grid' },
      Object.keys(providerCatalogue).map((id) =>
        el(ProviderCard, { key: id, providerId: id, status, onOpen })
      )
    ),
  ]);
};

export const ConnectionDetail = ({ providerId, status, onBack }) => {
  const t = useT();
  const provider = providerCatalogue[providerId];
  if (!provider) {
    return el(
      'section',
      { className: 'connections-detail' },
      el('p', null, t('guide.fallbackTitle'))
    );
  }
  const steps = providerSetupSteps[providerId] ?? [];
  const state = classifyConnectionState(status, providerId);
  return el(
    'section',
    {
      className: 'connections-detail',
      'data-provider-id': providerId,
    },
    [
      el('header', { key: 'h', className: 'row connections-detail-header' }, [
        el(
          'button',
          {
            key: 'back',
            type: 'button',
            'data-action': 'back-to-connections',
            onClick: () => onBack?.(),
          },
          t('connections.back')
        ),
        el('h2', { key: 'title' }, tx(t, provider.label, provider.labelKey)),
        el(StateBadge, { key: 'badge', state }),
      ]),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        tx(t, provider.apiCredentials.hint, provider.apiCredentials.hintKey)
      ),
      el(
        'ol',
        { key: 'steps', className: 'connections-detail-steps' },
        steps.map((step) =>
          el(
            'li',
            {
              key: step.id,
              className: 'connections-detail-step',
              'data-step-id': step.id,
            },
            [
              el('h3', { key: 'h' }, t(step.titleKey)),
              el('p', { key: 'b' }, t(step.bodyKey)),
            ]
          )
        )
      ),
      provider.apiCredentials.docsUrl
        ? el(
            'a',
            {
              key: 'docs',
              href: provider.apiCredentials.docsUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'connections-detail-docs',
            },
            t('settings.docsLink')
          )
        : null,
    ]
  );
};
