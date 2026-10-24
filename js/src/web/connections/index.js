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
import { RecommendedHeader } from './recommended.js';
import { api } from '../dom.js';
import { useLocaleContext, useT } from '../i18n.js';
import { LocalServerHelp } from '../connection-guide.js';
import {
  buildProbeHeaders,
  buildProbeUrl,
  credentialsFromLinks,
  hasSavedCredentials,
  hasRequiredCredentials,
  providerCatalogue,
  tryDirect,
} from '../connection-guides.js';
import { providerSetupSteps } from './setup-steps.js';
import {
  TelegramSessionsPanel,
  TelegramLoginForm,
  announceConnected,
} from './telegram-sessions.js';
import { byPopularity, formatUsers, serviceUsers } from './popularity.js';
import { BrowserSignIns, listOf } from './browser-sign-ins.js';
import { WhatsAppWebPanel } from './whatsapp-web.js';
import { Busy } from '../spinner.js';
import { EmailPullRow } from './email-pull.js';
import { FETCHABLE, FetchNow } from './fetch-now.js';
import { GithubInbox } from './github-inbox.js';

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

// A status that is still at work ("Saving…") shows Telegram's arc
// (R-Y84); one that is done is plain text.
const working = (text) => ({ busy: true, text });

const StatusText = ({ status }) =>
  status?.busy
    ? el(Busy, { as: 'span' }, status.text)
    : el('span', { className: 'meta' }, status);

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

/** Where "read the docs" points: the API reference, or the driver. */
const docsUrlOf = (provider) =>
  provider.session?.docsUrl ?? provider.apiCredentials?.docsUrl ?? null;

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
  // Naukri, VietnamWorks and TopCV publish no API, so there is no
  // credential to classify: the sign-in lives in the browser profile
  // the local server drives (issue #29).
  if (providerCatalogue[providerId]?.browserOnly) {
    return 'browser-session';
  }
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
  'browser-session': 'connections.state.browserSession',
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

  // Reset only when the saved values really change: the parent builds a
  // new object on every render, which used to wipe "Saved." at once.
  const initialKey = JSON.stringify(initialValues ?? {});
  useEffect(() => {
    // The status stays: saving changes the saved values, and wiping the
    // "Saved." that announces it made the e2e (R-O13) race the refresh.
    setValues(initialValues);
  }, [initialKey]);

  const fields = provider.apiCredentials?.fields ?? [];

  const save = async () => {
    setStatus(working(t('settings.saving')));
    let saved = 0;
    try {
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
        saved += 1;
      }
    } catch (error) {
      // Never "Saving..." forever, never a silent half-save (R-Z12).
      setStatus(
        t('settings.saveFailed', { error: String(error?.message ?? error) })
      );
      return;
    }
    setStatus(t('settings.saved'));
    if (saved > 0) {
      announceConnected();
    }
    await refresh?.();
  };

  const forget = async (field) => {
    const label = tx(t, field.label, field.labelKey);
    setStatus(working(t('settings.forgetting', { label })));
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
      el(StatusText, { key: 'status', status }),
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
    setStatus(working(t('settings.importing', { label })));
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

  // A WhatsApp export with media is a zip: the server reads it (R-Z9).
  const importZip = async (file) => {
    setStatus(working(t('settings.importing', { label: file.name })));
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const answer = await api.whatsappArchive(
      file.name,
      globalThis.btoa(binary)
    );
    setStatus(
      answer?.error
        ? t('whatsapp.web.zipFailed', { error: answer.error })
        : t('whatsapp.web.zipImported', {
            label: file.name,
            count: answer.imported,
          })
    );
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (/\.zip$/i.test(file.name)) {
      await importZip(file);
      return;
    }
    // Mail is read as bytes, so every part keeps its own charset (R-Z5).
    const content =
      providerId === 'email'
        ? new Uint8Array(await file.arrayBuffer())
        : await file.text();
    await importPayload(content, file.name);
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
      el(StatusText, { key: 'status', status }),
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
          'aria-busy': state.status === 'pending' ? 'true' : undefined,
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

const AUTO_IMPORT_ACTIVE = new Set(['launching', 'waiting', 'importing']);
const AUTO_IMPORT_POLL_MS = 1500;

const autoImportStateText = (t, job) =>
  job.state === 'failed'
    ? t('autoImport.state.failed', { error: job.error ?? '' })
    : t(`autoImport.state.${job.state}`);

// Loads the server's auto-import status, adopts a job already running
// for this provider (e.g. after a page reload) and polls it while active.
const useAutoImportJob = (providerId, initialStatus, initialJob) => {
  const [status, setStatus] = useState(initialStatus);
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.autoImportStatus().then((next) => {
      if (cancelled) {
        return;
      }
      setStatus(next);
      const running = (next.jobs ?? []).find(
        (j) => j.provider === providerId && AUTO_IMPORT_ACTIVE.has(j.state)
      );
      if (running) {
        setJob(running);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const jobId = job?.id;
  const active = job ? AUTO_IMPORT_ACTIVE.has(job.state) : false;
  useEffect(() => {
    if (!jobId || !active) {
      return undefined;
    }
    const timer = globalThis.setInterval(async () => {
      const next = await api.autoImportJob(jobId);
      if (next?.id) {
        setJob(next);
      }
    }, AUTO_IMPORT_POLL_MS);
    return () => globalThis.clearInterval(timer);
  }, [jobId, active]);

  const apply = (result) => {
    if (result?.error) {
      setError(result.error);
    } else if (result?.id) {
      setError('');
      setJob(result);
    }
  };

  return { status, job, active, error, apply };
};

const AutoImportActions = ({ providerId, status, job, active, apply }) => {
  const t = useT();
  const canCapture = Boolean(status?.providers?.[providerId]?.canCapture);
  const button = (key, label, onClick, extra = {}) =>
    el(
      'button',
      {
        key,
        type: 'button',
        'data-action': `auto-import-${key}`,
        onClick,
        ...extra,
      },
      t(label)
    );
  if (!active) {
    return el('div', { className: 'row' }, [
      button(
        'start',
        'autoImport.start',
        async () => apply(await api.startAutoImport(providerId)),
        { className: 'primary', disabled: !status?.available }
      ),
      job ? el(AutoImportState, { key: 'state', job }) : null,
    ]);
  }
  return el('div', { className: 'row' }, [
    canCapture
      ? button(
          'capture',
          'autoImport.capture',
          async () => apply(await api.autoImportAction(job.id, 'capture')),
          { className: 'primary', disabled: job.state !== 'waiting' }
        )
      : null,
    button('finish', 'autoImport.finish', async () =>
      apply(await api.autoImportAction(job.id, 'stop'))
    ),
    el(AutoImportState, { key: 'state', job }),
  ]);
};

const AutoImportState = ({ job }) => {
  const t = useT();
  const text = `${autoImportStateText(t, job)} ${t('autoImport.imported', {
    count: job.imported,
  })}`;
  return AUTO_IMPORT_ACTIVE.has(job.state)
    ? el(Busy, { as: 'span' }, text)
    : el('span', { className: 'meta', role: 'status' }, text);
};

const AutoImportFiles = ({ files }) =>
  el(
    'ul',
    { className: 'meta auto-import-files' },
    files
      .slice(-5)
      .map((file, index) =>
        el(
          'li',
          { key: `${index}-${file.name}` },
          `${file.name}: ${file.error ?? file.imported}`
        )
      )
  );

const AutoImportUnavailable = ({ status }) => {
  const t = useT();
  return el(
    'p',
    { className: 'meta', role: 'status' },
    status.reason
      ? t('autoImport.unavailableReason', { reason: status.reason })
      : t('autoImport.unavailable')
  );
};

// Title (recommended), what happens, and whose sign-in it reuses.
const AutoImportIntro = ({ providerId, provider, status, job }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const service = tx(t, provider.label, provider.labelKey);
  const canCapture = Boolean(status?.providers?.[providerId]?.canCapture);
  const signIn = job ? null : status?.signIns?.[providerId];
  return el(React.Fragment, null, [
    el(RecommendedHeader, {
      key: 'h',
      tag: 'h4',
      titleClass: 'meta',
      titleKey: 'autoImport.title',
      className: 'provider-auto-import-header',
    }),
    el(
      'p',
      { key: 'intro' },
      t(canCapture ? 'autoImport.introCapture' : 'autoImport.intro', {
        service,
      })
    ),
    signIn
      ? el(
          'p',
          { key: 'signed-in', className: 'meta', 'data-signed-in': 'true' },
          t('autoImport.signedInFrom', {
            browsers: listOf(signIn.from ?? [], locale),
          })
        )
      : null,
  ]);
};

// "Import with browser": the local server opens the provider in a real
// browser (browser-commander), captures every downloaded export and,
// for chat apps without an export, the chat currently open there.
export const ProviderAutoImport = ({
  providerId,
  provider,
  initialStatus = null,
  initialJob = null,
}) => {
  const { status, job, active, error, apply } = useAutoImportJob(
    providerId,
    initialStatus,
    initialJob
  );
  const unavailable = status && !status.available;
  return el(
    'div',
    {
      className: 'col provider-auto-import',
      'data-provider': providerId,
      'data-tutorial-id': 'auto-import',
      'data-auto-import-state': job?.state ?? 'idle',
    },
    [
      el(AutoImportIntro, { key: 'intro', providerId, provider, status, job }),
      unavailable
        ? el(AutoImportUnavailable, { key: 'unavailable', status })
        : null,
      el(AutoImportActions, {
        key: 'actions',
        providerId,
        status,
        job,
        active,
        apply,
      }),
      error
        ? el('p', { key: 'error', className: 'meta', role: 'alert' }, error)
        : null,
      job?.files?.length
        ? el(AutoImportFiles, { key: 'files', files: job.files })
        : null,
    ]
  );
};

export const ProviderConnectionControls = ({
  providerId,
  provider,
  links = [],
  refresh = async () => {},
}) => {
  const t = useT();
  const credentials = credentialsFromLinks(provider, links);
  const ready =
    hasRequiredCredentials(provider, credentials) ||
    hasSavedCredentials(provider, links, credentials);
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
      providerId === 'email' ? el(EmailPullRow, { key: 'email-pull' }) : null,
      el(ProviderArchiveImport, { key: 'arch', providerId, provider }),
      providerId === 'github' ? el(GithubInbox, { key: 'inbox' }) : null,
      el(ConnectionProbeRow, {
        key: 'probe',
        provider,
        credentials,
      }),
    ]
  );
};

/**
 * Controls for a board with no public API (issue #29). There is nothing
 * to paste and nothing to probe: the user signs in once in the browser
 * profile the local server drives, and the CV screen does the rest.
 * The archive import stays, because exported message dumps still parse.
 */
const BrowserSessionPanel = ({ providerId, provider }) => {
  const t = useT();
  const session = provider.session;
  const openCv = () =>
    globalThis.dispatchEvent?.(
      new CustomEvent('meta-sovereign:navigate', { detail: { view: 'cv' } })
    );
  const link = (key, href, label) =>
    el(
      'a',
      {
        key,
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        'data-action': `open-${key}`,
      },
      label
    );
  return el(
    'div',
    { className: 'col provider-browser-session', 'data-browser-only': 'true' },
    [
      el(
        'h4',
        { key: 'h', className: 'meta' },
        tx(t, session.title, session.titleKey)
      ),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        tx(t, session.hint, session.hintKey)
      ),
      el('div', { key: 'links', className: 'row' }, [
        link('login', session.loginUrl, t('connections.session.login')),
        link('profile', session.profileUrl, t('connections.session.profile')),
      ]),
      el(
        'button',
        {
          key: 'cv',
          type: 'button',
          className: 'primary',
          'data-action': 'open-cv',
          'data-target-platform': session.cvPlatform,
          onClick: openCv,
        },
        t('connections.session.openCv')
      ),
      el(ProviderArchiveImport, { key: 'arch', providerId, provider }),
    ]
  );
};

// The card's two separate ways to connect, one under the other at the
// card's foot (aligned across a row): "Import with browser" — the
// local server opens the service, the user exports, the file is
// imported (recommended) — and "Enter manually" (API keys, a file, a
// pasted export). Browser-only boards have their own single route.
const ProviderCardActions = ({
  providerId,
  canImport,
  browserOnly,
  onOpen,
}) => {
  const t = useT();
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const startImport = async () => {
    setStarting(true);
    const job = await api.startAutoImport(providerId);
    setStarting(false);
    if (job?.error) {
      setError(job.error);
      return;
    }
    onOpen?.(providerId, 'import');
  };
  const button = (key, props, label) =>
    el(
      'button',
      { key, type: 'button', 'data-target-provider': providerId, ...props },
      label
    );
  return el('div', { className: 'connections-card-actions' }, [
    canImport
      ? button(
          'import',
          {
            className: 'primary',
            'data-action': 'connection-auto-import',
            disabled: starting,
            onClick: startImport,
          },
          [
            el('span', { key: 'l' }, t('autoImport.title')),
            el(
              'span',
              { key: 'tag', className: 'recommended-tag' },
              t('connections.recommended')
            ),
          ]
        )
      : null,
    button(
      'open',
      {
        className: canImport ? '' : 'primary',
        'data-action': 'open-connection-detail',
        'data-mode': 'manual',
        onClick: () => onOpen?.(providerId, 'manual'),
      },
      browserOnly ? t('connections.openDetail') : t('connections.enterManually')
    ),
    error
      ? el('p', { key: 'error', className: 'meta', role: 'alert' }, error)
      : null,
    FETCHABLE.has(providerId)
      ? el(FetchNow, { key: 'fetch', providerId })
      : null,
  ]);
};

const ProviderCard = ({ providerId, status, autoImport, onOpen }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const provider = providerCatalogue[providerId];
  const state = classifyConnectionState(status, providerId);
  const users = serviceUsers[providerId];
  const signedIn = autoImport?.signIns?.[providerId];
  const canImport =
    !provider.browserOnly &&
    autoImport?.available !== false &&
    Boolean(autoImport?.providers?.[providerId] ?? !autoImport);
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
      users || signedIn
        ? el(
            'p',
            { key: 'facts', className: 'meta connections-card-facts' },
            [
              users
                ? t('connections.users', {
                    count: formatUsers(users, locale),
                  })
                : null,
              signedIn
                ? t('connections.signedInFrom', {
                    browsers: listOf(signedIn.from ?? [], locale),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          )
        : null,
      el(
        'p',
        { key: 'hint', className: 'meta' },
        tx(t, provider.archive.hint, provider.archive.hintKey)
      ),
      providerId === 'whatsapp'
        ? el(WhatsAppWebPanel, { key: 'wa-web' })
        : null,
      el(ProviderCardActions, {
        key: 'actions',
        providerId,
        canImport,
        browserOnly: Boolean(provider.browserOnly),
        onOpen,
      }),
    ]
  );
};

// The server's auto-import status (null while loading or without one).
const useAutoImportStatus = () => {
  const [status, setStatus] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.autoImportStatus().then((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [version]);
  return [status, () => setVersion((v) => v + 1)];
};

export const ConnectionsList = ({ status, onOpen, initialAutoImport }) => {
  const t = useT();
  const [loaded, reload] = useAutoImportStatus();
  const autoImport = loaded ?? initialAutoImport ?? null;
  const ids = byPopularity(Object.keys(providerCatalogue));
  return el(
    'section',
    {
      className: 'connections-list',
      'data-tutorial-id': 'connections:list',
    },
    [
      el('header', { key: 'h', className: 'connections-list-header' }, [
        el('h2', { key: 'title' }, t('connections.title')),
        el('p', { key: 'intro', className: 'meta' }, t('connections.intro')),
      ]),
      // Shown while the status loads (so it never pops in late) and
      // hidden only once the server says browser import is unavailable.
      autoImport?.available === false
        ? null
        : el(BrowserSignIns, {
            key: 'sign-ins',
            status: autoImport,
            onImported: reload,
          }),
      el(
        'div',
        { key: 'grid', className: 'connections-grid' },
        ids.map((id) =>
          el(ProviderCard, {
            key: id,
            providerId: id,
            status,
            autoImport,
            onOpen,
          })
        )
      ),
    ]
  );
};

const DETAIL_MODES = ['import', 'manual'];

// "Import with browser" | "Enter manually": two separate ways to
// connect, one shown at a time (WAI-ARIA tabs, ←/→ between them).
const SetupTabs = ({ providerId, mode, onMode }) => {
  const t = useT();
  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next = DETAIL_MODES[(DETAIL_MODES.indexOf(mode) + 1) % 2];
    onMode?.(next);
    globalThis.document?.getElementById(`conn-tab-${next}`)?.focus();
  };
  const tab = (id, label, extra = null) =>
    el(
      'button',
      {
        key: id,
        id: `conn-tab-${id}`,
        type: 'button',
        role: 'tab',
        'aria-selected': mode === id ? 'true' : 'false',
        'aria-controls': `conn-panel-${id}`,
        tabIndex: mode === id ? 0 : -1,
        className: 'connections-tab',
        'data-action': `connection-mode-${id}`,
        'data-target-provider': providerId,
        onClick: () => onMode?.(id),
      },
      [el('span', { key: 'l' }, label), extra]
    );
  return el(
    'div',
    {
      className: 'connections-tabs',
      role: 'tablist',
      'aria-label': t('connections.howToConnect'),
      onKeyDown,
    },
    [
      tab(
        'import',
        t('autoImport.title'),
        el(
          'span',
          { key: 'tag', className: 'recommended-tag' },
          t('connections.recommended')
        )
      ),
      tab('manual', t('connections.enterManually')),
    ]
  );
};

// What to do by hand, step by step (the tutorial points here too).
const ManualIntro = ({ providerId, provider, hint }) => {
  const t = useT();
  const steps = providerSetupSteps[providerId] ?? [];
  return el(
    'div',
    {
      className: 'card connections-manual-intro',
      'data-tutorial-id': 'manual-setup',
    },
    [
      el('p', { key: 'hint', className: 'meta' }, hint),
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
      docsUrlOf(provider)
        ? el(
            'a',
            {
              key: 'docs',
              href: docsUrlOf(provider),
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

const manualHint = (t, provider) =>
  provider.browserOnly
    ? tx(t, provider.session.hint, provider.session.hintKey)
    : tx(t, provider.apiCredentials.hint, provider.apiCredentials.hintKey);

const ManualPanel = ({ providerId, provider, links, refresh }) => {
  const t = useT();
  return el(
    'div',
    {
      id: 'conn-panel-manual',
      role: provider.browserOnly ? undefined : 'tabpanel',
      'aria-labelledby': provider.browserOnly ? undefined : 'conn-tab-manual',
      className: 'connections-panel',
    },
    [
      el(ManualIntro, {
        key: 'intro',
        providerId,
        provider,
        hint: manualHint(t, provider),
      }),
      providerId === 'telegram'
        ? el(TelegramSessionsPanel, { key: 'find', onConnected: refresh })
        : null,
      providerId === 'telegram'
        ? el(TelegramLoginForm, { key: 'login', onConnected: refresh })
        : null,
      provider.browserOnly
        ? el(BrowserSessionPanel, { key: 'controls', providerId, provider })
        : el(ProviderConnectionControls, {
            key: 'controls',
            providerId,
            provider,
            links,
            refresh,
          }),
    ]
  );
};

const ImportPanel = ({ providerId, provider }) =>
  el(
    'div',
    {
      id: 'conn-panel-import',
      role: 'tabpanel',
      'aria-labelledby': 'conn-tab-import',
      className: 'connections-panel',
    },
    el(
      'section',
      { className: 'card glass connections-detail-auto' },
      el(ProviderAutoImport, { providerId, provider })
    )
  );

export const ConnectionDetail = ({
  providerId,
  status,
  links = [],
  refresh = async () => {},
  onBack,
  mode = 'import',
  onMode,
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
  const state = classifyConnectionState(status, providerId);
  const shown = provider.browserOnly ? 'manual' : mode;
  return el(
    'section',
    {
      className: 'connections-detail',
      id: `conn-${providerId}`,
      'data-provider-id': providerId,
      'data-mode': shown,
      'data-tutorial-id': 'connections:detail',
    },
    [
      el(
        'button',
        {
          key: 'back',
          type: 'button',
          className: 'connections-back',
          'data-action': 'back-to-connections',
          onClick: () => onBack?.(),
        },
        [
          el('span', { key: 'i', 'aria-hidden': 'true' }, '←'),
          el('span', { key: 'l' }, t('connections.back')),
        ]
      ),
      el('header', { key: 'h', className: 'connections-detail-header' }, [
        el('h2', { key: 'title' }, tx(t, provider.label, provider.labelKey)),
        el(StateBadge, { key: 'badge', state }),
      ]),
      provider.browserOnly
        ? null
        : el(SetupTabs, { key: 'tabs', providerId, mode: shown, onMode }),
      shown === 'import'
        ? el(ImportPanel, { key: 'panel', providerId, provider })
        : el(ManualPanel, {
            key: 'panel',
            providerId,
            provider,
            links,
            refresh,
          }),
    ]
  );
};
