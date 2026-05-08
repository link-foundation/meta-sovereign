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

import React, { useEffect, useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { LocalServerHelp } from '../connection-guide.js';
import {
  buildProbeHeaders,
  buildProbeUrl,
  credentialsFromLinks,
  hasRequiredCredentials,
  providerCatalogue,
  tryDirect,
} from '../connection-guides.js';
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

const errorHintFor = (t, provider, status) => {
  const keys = provider?.apiCredentials?.errorHintKeys;
  const key = keys?.[status];
  if (key) {
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  return provider?.apiCredentials?.errorHints?.[status];
};

const fmtClassification = (t, result, provider) => {
  if (!result) {
    return null;
  }
  if (result.ok) {
    return {
      tone: 'ok',
      text: t('settings.probe.connected', { status: result.status }),
    };
  }
  if (result.classification === 'http') {
    const hint = errorHintFor(t, provider, result.status);
    return {
      tone: 'warn',
      text: hint
        ? t('settings.probe.httpHint', { status: result.status, hint })
        : t('settings.probe.httpNoHint', { status: result.status }),
    };
  }
  if (result.classification === 'cors') {
    return {
      tone: 'error',
      text: t('settings.probe.cors'),
    };
  }
  return {
    tone: 'warn',
    text: t('settings.probe.network', {
      message: result.error?.message ?? t('settings.probe.fetchFailed'),
    }),
  };
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

const ProviderCredentialsForm = ({
  providerId,
  provider,
  initialValues,
  refresh,
}) => {
  const t = useT();
  const [values, setValues] = useState(initialValues);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setValues(initialValues);
    setStatus('');
  }, [initialValues]);

  const fields = provider.apiCredentials?.fields ?? [];

  const save = async () => {
    setStatus(t('settings.saving'));
    for (const field of fields) {
      const value = values[field.id] ?? '';
      if (value.length === 0) {
        continue;
      }
      await api.put({
        id: field.secretId,
        tokens: ['secret', providerId, field.id],
        value,
        updated: new Date().toISOString(),
      });
    }
    setStatus(t('settings.saved'));
    await refresh?.();
  };

  const forget = async (field) => {
    const label = tx(t, field.label, field.labelKey);
    setStatus(t('settings.forgetting', { label }));
    try {
      await api.del(field.secretId);
    } catch {
      // The link may not exist yet.
    }
    setValues((current) => ({ ...current, [field.id]: '' }));
    setStatus(t('settings.forgotten', { label }));
    await refresh?.();
  };

  return el('div', { className: 'col provider-credentials' }, [
    el('h4', { key: 'h', className: 'meta' }, t('settings.credentials')),
    ...fields.map((field) =>
      el(
        'label',
        {
          key: field.id,
          className: 'col provider-credential-row',
          'data-field-id': field.id,
        },
        [
          el('span', { key: 'label' }, [
            tx(t, field.label, field.labelKey),
            field.optional
              ? el(
                  'span',
                  { key: 'opt', className: 'meta' },
                  ` ${t('settings.optional')}`
                )
              : null,
          ]),
          el('div', { key: 'row', className: 'row' }, [
            el('input', {
              key: 'input',
              type: field.type ?? 'text',
              placeholder: field.placeholder ?? '',
              autoComplete: 'off',
              spellCheck: false,
              value: values[field.id] ?? '',
              'data-field-input': field.id,
              onChange: (event) =>
                setValues((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                })),
            }),
            el(
              'button',
              {
                key: 'forget',
                type: 'button',
                onClick: () => forget(field),
              },
              t('settings.forget')
            ),
          ]),
          el(
            'div',
            { key: 'meta', className: 'meta' },
            t('settings.storedAs', { id: field.secretId })
          ),
        ]
      )
    ),
    el('div', { key: 'actions', className: 'row' }, [
      el(
        'button',
        {
          key: 'save',
          type: 'button',
          className: 'primary',
          onClick: save,
          'data-action': 'save-credentials',
        },
        t('settings.saveCredentials')
      ),
      el('span', { key: 'status', className: 'meta' }, status),
    ]),
  ]);
};

const ProviderArchiveImport = ({ providerId, provider }) => {
  const t = useT();
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');

  const importPayload = async (raw, label) => {
    if (!raw || (typeof raw === 'string' && raw.trim().length === 0)) {
      setStatus(t('settings.nothingToImport'));
      return;
    }
    setStatus(t('settings.importing', { label }));
    try {
      const mod = await import('../../sources/index.js');
      const adapter = mod.getSource(providerId);
      let archive = raw;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            archive = JSON.parse(trimmed);
          } catch {
            archive = trimmed;
          }
        } else {
          archive = trimmed;
        }
      }
      const messages = await adapter.parseArchive(archive);
      let count = 0;
      for (const message of messages ?? []) {
        await api.put(message);
        count += 1;
      }
      setStatus(t('settings.importedCount', { label, count }));
    } catch (error) {
      setStatus(
        t('settings.importFailed', { message: error.message ?? String(error) })
      );
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    await importPayload(text, file.name);
  };

  const onPaste = async () => {
    await importPayload(paste, 'pasted snippet');
  };

  return el('div', { className: 'col provider-archive-import' }, [
    el('h4', { key: 'h', className: 'meta' }, t('settings.archive')),
    el(
      'p',
      { key: 'hint' },
      tx(t, provider.archive.hint, provider.archive.hintKey)
    ),
    el('div', { key: 'file-row', className: 'row' }, [
      el('input', {
        key: 'file',
        type: 'file',
        accept: provider.archive.accept ?? '*/*',
        'data-action': 'archive-file',
        onChange: onFile,
      }),
    ]),
    el(
      'div',
      { key: 'paste-h', className: 'meta' },
      t('settings.archivePasteHint')
    ),
    el('textarea', {
      key: 'paste',
      rows: 5,
      placeholder: provider.archive.fileHint
        ? t('settings.archivePasteWith', { label: provider.archive.fileHint })
        : t('settings.archivePastePlaceholder'),
      value: paste,
      'data-action': 'archive-paste',
      onChange: (event) => setPaste(event.target.value),
    }),
    el('div', { key: 'paste-row', className: 'row' }, [
      el(
        'button',
        {
          key: 'submit',
          type: 'button',
          onClick: onPaste,
          'data-action': 'archive-import',
        },
        t('settings.importPasted')
      ),
      el('span', { key: 'status', className: 'meta' }, status),
    ]),
  ]);
};

const ConnectionProbeRow = ({ provider, credentials }) => {
  const t = useT();
  const [state, setState] = useState({ status: 'idle' });
  const url = buildProbeUrl({ provider, credentials });
  const headers = buildProbeHeaders({ provider, credentials });
  const ready = url !== null;

  const probe = async () => {
    setState({ status: 'pending' });
    const init =
      Object.keys(headers).length > 0 ? { headers, method: 'GET' } : undefined;
    const result = await tryDirect({ url, init });
    setState({ status: 'done', result });
  };

  const result = state.result;
  const formatted = fmtClassification(t, result, provider);

  return el('div', { className: 'col probe-row' }, [
    el('div', { key: 'row', className: 'row' }, [
      el(
        'button',
        {
          key: 'probe',
          type: 'button',
          className: 'primary',
          onClick: probe,
          disabled: !ready || state.status === 'pending',
          'data-action': 'probe',
        },
        state.status === 'pending'
          ? t('settings.probe.probing')
          : t('settings.probe.button')
      ),
      el(
        'span',
        {
          key: 'meta',
          className: `meta probe-status probe-tone-${
            formatted ? formatted.tone : 'idle'
          }`,
          'data-probe-status': formatted?.tone ?? 'idle',
        },
        formatted
          ? formatted.text
          : ready
            ? t('settings.probe.idle', { url })
            : t('settings.probe.notReady')
      ),
    ]),
    result && !result.ok && result.classification === 'cors'
      ? el(LocalServerHelp, { key: 'help' })
      : null,
  ]);
};

export const ProviderConnectionControls = ({
  providerId,
  provider,
  links = [],
  refresh = async () => {},
}) => {
  const t = useT();
  const credentials = credentialsFromLinks(provider, links);
  const ready = hasRequiredCredentials(provider, credentials);
  return el(
    'section',
    {
      className:
        'card connection-provider-controls connections-detail-controls',
      'data-provider': providerId,
      'data-tutorial-id': `connection-detail:${providerId}`,
    },
    [
      el('header', { key: 'h', className: 'row' }, [
        el('h3', { key: 'label' }, t('connections.controlsTitle')),
        el(
          'span',
          {
            key: 'state',
            className: `meta provider-state ${ready ? 'ready' : 'not-ready'}`,
          },
          ready ? t('settings.credentialsSaved') : t('settings.noCredentials')
        ),
      ]),
      el(ProviderCredentialsForm, {
        key: 'creds',
        providerId,
        provider,
        initialValues: credentials,
        refresh,
      }),
      el(ProviderArchiveImport, { key: 'arch', providerId, provider }),
      el(ConnectionProbeRow, {
        key: 'probe',
        provider,
        credentials,
      }),
    ]
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

export const ConnectionDetail = ({
  providerId,
  status,
  links = [],
  refresh = async () => {},
  onBack,
}) => {
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
      id: `conn-${providerId}`,
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
      el(ProviderConnectionControls, {
        key: 'controls',
        providerId,
        provider,
        links,
        refresh,
      }),
    ]
  );
};
