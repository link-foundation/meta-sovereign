// Settings view (issue #16).
//
// One Settings nav surface lists every catalogued provider and exposes
// three things per provider, in this order:
//
//   1. credential inputs (R-O3) — typed `<input>`s for every field in
//      `provider.apiCredentials.fields`. Sensitive fields use `password`,
//      non-sensitive identifiers use `text`. On save the values are
//      written as `secret:*` links via `api.put`; the existing
//      `wrapSecretStore` (server-side) and the local-store sync filter
//      handle the encryption-at-rest + sync suppression contracts (R-O8).
//   2. archive import (R-O4, R-O5) — a `<input type="file">` and a
//      paste `<textarea>` fallback that both feed the same
//      `parseArchive`-shaped flow.
//   3. probe (R-O1, R-O2, R-O9, R-O10) — a "Try directly" button that
//      builds the URL via `buildProbeUrl()` from the persisted
//      credentials. When credentials are missing the button explains
//      what is needed instead of firing a guaranteed-404/400 request.
//
// Per-provider cards anchor at `id="conn-{providerId}"` so per-section
// "Connect first" CTAs (R-O7) can deep-link with #conn-telegram, etc.

import React, { useEffect, useState } from 'react';
import { api } from './dom.js';
import {
  providerCatalogue,
  buildProbeUrl,
  buildProbeHeaders,
  hasRequiredCredentials,
  credentialsFromLinks,
  tryDirect,
} from './connection-guides.js';
import { LocalServerHelp } from './connection-guide.js';
import { useT } from './i18n.js';

const el = React.createElement;

// Translate a registry value using its `*Key` reference when present, falling
// back to the literal English copy. Mirrors the helper in connection-guide.js.
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
        // Empty input means "leave existing or do not create".
        // Use the explicit "Forget" button to delete.
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
    await refresh();
  };

  const forget = async (field) => {
    const label = tx(t, field.label, field.labelKey);
    setStatus(t('settings.forgetting', { label }));
    try {
      await api.del(field.secretId);
    } catch {
      // Fine — link may not exist yet.
    }
    setValues((current) => ({ ...current, [field.id]: '' }));
    setStatus(t('settings.forgotten', { label }));
    await refresh();
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
      // Lazy import keeps the source adapters out of the initial bundle
      // for users who never open Settings.
      const mod = await import('../sources/index.js');
      const adapter = mod.getSource(providerId);
      let archive = raw;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            archive = JSON.parse(trimmed);
          } catch {
            // Some adapters accept text directly (e.g. WhatsApp .txt).
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

const SettingsProbeRow = ({ provider, credentials }) => {
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

const SettingsProviderCard = ({ providerId, provider, links, refresh }) => {
  const t = useT();
  const credentials = credentialsFromLinks(provider, links);
  const ready = hasRequiredCredentials(provider, credentials);
  return el(
    'section',
    {
      className: 'card connection-settings-provider',
      id: `conn-${providerId}`,
      'data-provider': providerId,
    },
    [
      el('header', { key: 'h', className: 'row' }, [
        el('h3', { key: 'label' }, tx(t, provider.label, provider.labelKey)),
        el(
          'span',
          {
            key: 'state',
            className: `meta provider-state ${ready ? 'ready' : 'not-ready'}`,
          },
          ready ? t('settings.credentialsSaved') : t('settings.noCredentials')
        ),
      ]),
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
      el(ProviderCredentialsForm, {
        key: 'creds',
        providerId,
        provider,
        initialValues: credentials,
        refresh,
      }),
      el(ProviderArchiveImport, { key: 'arch', providerId, provider }),
      el(SettingsProbeRow, {
        key: 'probe',
        provider,
        credentials,
      }),
    ]
  );
};

export const SettingsView = () => {
  const t = useT();
  const [refreshKey, setRefreshKey] = useState(0);
  const [links, setLinks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.links().then((all) => {
      if (cancelled) {
        return;
      }
      setLinks((all ?? []).filter((link) => link.id?.startsWith('secret:')));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Honour deep-links: when the URL hash is `#conn-telegram` (R-O7),
  // scroll to the matching card after the first render.
  useEffect(() => {
    if (links === null) {
      return;
    }
    const hash = globalThis.location?.hash ?? '';
    if (hash.startsWith('#conn-')) {
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [links]);

  const refresh = async () => {
    setRefreshKey((current) => current + 1);
  };

  if (links === null) {
    return el('div', { className: 'meta' }, t('common.loading'));
  }

  return el('div', { className: 'col settings-view' }, [
    el('h2', { key: 'h' }, t('settings.title')),
    el('p', { key: 'intro', className: 'meta' }, t('settings.intro')),
    ...Object.entries(providerCatalogue).map(([providerId, provider]) =>
      el(SettingsProviderCard, {
        key: providerId,
        providerId,
        provider,
        links,
        refresh,
      })
    ),
  ]);
};
