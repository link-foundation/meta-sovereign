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
  tryDirect,
  applyLocalServerOverride,
} from './connection-guides.js';

const el = React.createElement;

const ProbeRow = ({ provider }) => {
  const [state, setState] = useState({ status: 'idle' });
  const probe = async () => {
    setState({ status: 'pending' });
    const result = await tryDirect({ url: provider.apiCredentials.probeUrl });
    setState({ status: 'done', result });
  };
  const result = state.result;
  return el('div', { className: 'col probe-row' }, [
    el('div', { key: 'row', className: 'row' }, [
      el(
        'button',
        {
          key: 'probe',
          type: 'button',
          className: 'primary',
          onClick: probe,
          disabled: state.status === 'pending',
        },
        state.status === 'pending' ? 'probing...' : 'Try directly'
      ),
      el(
        'span',
        { key: 'meta', className: 'meta' },
        result
          ? result.ok
            ? `OK ${result.status}`
            : result.classification === 'cors'
              ? 'Blocked by CORS'
              : `Failed (${result.classification}${
                  result.status ? ` ${result.status}` : ''
                })`
          : `Endpoint: ${provider.apiCredentials.probeUrl}`
      ),
    ]),
    result && !result.ok && result.classification === 'cors'
      ? el(LocalServerHelp, { key: 'help' })
      : null,
  ]);
};

const ProviderCard = ({ providerId }) => {
  const provider = getProvider(providerId);
  return el('section', { className: 'card connection-guide-provider' }, [
    el('h3', { key: 'h' }, provider.label),
    el('div', { key: 'archive', className: 'col' }, [
      el('h4', { key: 'h', className: 'meta' }, provider.archive.title),
      el('p', { key: 'p' }, provider.archive.hint),
      el(
        'div',
        { key: 'fileHint', className: 'meta' },
        `Files: ${provider.archive.fileHint}`
      ),
    ]),
    el('div', { key: 'api', className: 'col' }, [
      el('h4', { key: 'h', className: 'meta' }, provider.apiCredentials.title),
      el('p', { key: 'p' }, provider.apiCredentials.hint),
      el(
        'div',
        { key: 'env', className: 'meta' },
        `Env var: ${provider.apiCredentials.envVar}`
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
          'How to obtain the credentials ↗'
        )
      ),
      el(ProbeRow, { key: 'probe', provider }),
    ]),
  ]);
};

export const LocalServerHelp = () => {
  const [override, setOverride] = useState('');
  const apply = () => {
    if (!override) {
      return;
    }
    applyLocalServerOverride(override);
  };
  return el('aside', { className: 'card local-server-help', role: 'note' }, [
    el('h4', { key: 'h' }, localServerHelp.title),
    el('p', { key: 'p' }, localServerHelp.body),
    ...localServerHelp.options.map((option) =>
      el('div', { key: option.id, className: 'col local-server-help-opt' }, [
        el('div', { key: 'h', className: 'meta' }, option.heading),
        el('pre', { key: 'cmd' }, option.command),
        el('div', { key: 'hint', className: 'meta' }, option.hint),
      ])
    ),
    el(
      'div',
      { key: 'override-h', className: 'meta' },
      localServerHelp.manualOverride.hint
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
        'Use this server'
      ),
    ]),
  ]);
};

export const ConnectionGuide = ({ section }) => {
  const guide = connectionGuides[section]
    ? getGuide(section)
    : { title: 'Nothing here yet.', body: '', providers: [] };
  return el(
    'section',
    {
      className: 'connection-guide',
      'data-connection-guide': section,
      role: 'note',
    },
    [
      el('h2', { key: 'h' }, guide.title),
      el('p', { key: 'body' }, guide.body),
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
