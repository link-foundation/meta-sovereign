// "Use your browser sign-ins" (top of Connections, recommended).
//
// Two explicit steps, both read-only for the user's browsers:
//   1. "Find sign-ins" lists every installed browser profile and the
//      services it is signed in to (the server counts cookies by site,
//      it never reads their values for this);
//   2. "Use these sign-ins" copies the services' cookies from the ticked
//      browsers so each "Import with browser" window opens signed in.
// Safari's data is behind macOS Full Disk Access; the panel explains
// which app needs it and opens the right System Settings pane.

import React, { useState } from 'react';
import { api } from '../dom.js';
import { useLocaleContext, useT } from '../i18n.js';
import { providerCatalogue } from '../connection-guides.js';

const el = React.createElement;

export const serviceName = (t, id) => {
  const provider = providerCatalogue[id];
  if (!provider) {
    return id;
  }
  const translated = provider.labelKey ? t(provider.labelKey) : null;
  return translated && translated !== provider.labelKey
    ? translated
    : provider.label;
};

export const listOf = (items, locale) => {
  try {
    return new Intl.ListFormat(locale, {
      style: 'short',
      type: 'conjunction',
    }).format(items);
  } catch {
    return items.join(', ');
  }
};

const keyOf = (b) => `${b.browser}\u0000${b.profile}`;

// Tick the browsers that hold sign-ins and can be read.
const defaultChoice = (browsers) =>
  Object.fromEntries(
    browsers.map((b) => [
      keyOf(b),
      !b.error && Object.keys(b.services).length > 0,
    ])
  );

const BrowserRow = ({ browser, checked, onToggle }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const services = Object.keys(browser.services).map((id) =>
    serviceName(t, id)
  );
  let detail;
  if (browser.needsFullDiskAccess) {
    detail = t('signIns.needsAccess');
  } else if (browser.error) {
    detail = t('signIns.error', { error: browser.error });
  } else if (services.length) {
    detail = t('signIns.found', { services: listOf(services, locale) });
  } else {
    detail = t('signIns.nothing');
  }
  const disabled = Boolean(browser.error) || services.length === 0;
  return el(
    'li',
    {
      className: 'sign-ins-browser',
      'data-browser': browser.browser,
      'data-state': disabled ? 'unavailable' : 'ready',
    },
    el('label', { className: 'sign-ins-browser-row' }, [
      el('input', {
        key: 'check',
        type: 'checkbox',
        checked: Boolean(checked) && !disabled,
        disabled,
        onChange: onToggle,
      }),
      el('span', { key: 'text', className: 'sign-ins-browser-text' }, [
        el('span', { key: 'name', className: 'sign-ins-browser-name' }, [
          el('strong', { key: 'label' }, browser.label),
          browser.isDefault
            ? el(
                'span',
                { key: 'default', className: 'sign-ins-default' },
                t('signIns.default')
              )
            : null,
        ]),
        el('span', { key: 'detail', className: 'meta' }, detail),
      ]),
    ])
  );
};

const FullDiskAccess = ({ access, onOpen }) => {
  const t = useT();
  return el('div', { className: 'sign-ins-access', role: 'note' }, [
    el('strong', { key: 'title' }, t('signIns.fdaTitle')),
    el(
      'p',
      { key: 'body', className: 'meta' },
      t('signIns.fdaBody', { app: access?.app ?? 'Terminal' })
    ),
    el(
      'button',
      {
        key: 'open',
        type: 'button',
        'data-action': 'open-full-disk-access',
        onClick: onOpen,
      },
      t('signIns.fdaOpen')
    ),
  ]);
};

const ImportResult = ({ result }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const ready = Object.entries(result.services ?? {}).map(
    ([id, info]) => `${serviceName(t, id)} (${listOf(info.from, locale)})`
  );
  return el('div', { className: 'sign-ins-result', role: 'status' }, [
    el(
      'p',
      { key: 'ready' },
      ready.length
        ? t('signIns.ready', { services: listOf(ready, locale) })
        : t('signIns.readyNone')
    ),
    ...(result.errors ?? []).map((e, index) =>
      el(
        'p',
        { key: `e${index}`, className: 'meta' },
        `${e.label ?? e.browser}: ${e.needsFullDiskAccess ? t('signIns.needsAccess') : e.error}`
      )
    ),
  ]);
};

const SignInsHeader = () => {
  const t = useT();
  return el('header', { className: 'row sign-ins-header' }, [
    el('h3', { key: 'title', id: 'sign-ins-title' }, t('signIns.title')),
    el(
      'span',
      { key: 'tag', className: 'recommended-tag' },
      t('connections.recommended')
    ),
  ]);
};

const BrowserList = ({ browsers, chosen, onToggle }) => {
  const t = useT();
  if (browsers.length === 0) {
    return el('p', { className: 'meta' }, t('signIns.none'));
  }
  return el(
    'ul',
    { className: 'sign-ins-browsers' },
    browsers.map((browser) =>
      el(BrowserRow, {
        key: keyOf(browser),
        browser,
        checked: chosen[keyOf(browser)],
        onToggle: () => onToggle(keyOf(browser)),
      })
    )
  );
};

// "Find sign-ins" (read-only) first; "Use these sign-ins" once there is
// something to use.
const SignInsActions = ({ scanned, busy, canUse, onFind, onUse }) => {
  const t = useT();
  const working = busy === 'scan' || busy === 'import';
  return el('div', { className: 'row' }, [
    scanned
      ? el(
          'button',
          {
            key: 'use',
            type: 'button',
            className: 'primary',
            'data-action': 'use-sign-ins',
            disabled: Boolean(busy) || !canUse,
            onClick: onUse,
          },
          t('signIns.use')
        )
      : null,
    el(
      'button',
      {
        key: 'scan',
        type: 'button',
        className: scanned ? '' : 'primary',
        'data-action': 'find-sign-ins',
        disabled: Boolean(busy),
        onClick: onFind,
      },
      t(scanned ? 'signIns.rescan' : 'signIns.scan')
    ),
    working
      ? el(
          'span',
          { key: 'busy', className: 'meta', role: 'status' },
          t(busy === 'scan' ? 'signIns.scanning' : 'signIns.importing')
        )
      : null,
  ]);
};

// The access report when something is (or will be) blocked by macOS.
const fullDiskAccessNeeded = (scan, status) => {
  const access = scan?.fullDiskAccess ?? status?.fullDiskAccess ?? null;
  const denied = access?.required && access.granted === false;
  const blocked = (scan?.browsers ?? []).some((b) => b.needsFullDiskAccess);
  return denied || blocked ? (access ?? {}) : null;
};

export const BrowserSignIns = ({ status, onImported }) => {
  const t = useT();
  const [scan, setScan] = useState(null);
  const [chosen, setChosen] = useState({});
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async (kind, action) => {
    setBusy(kind);
    setError('');
    try {
      const answer = await action();
      if (answer?.error) {
        setError(answer.error);
        return null;
      }
      return answer;
    } finally {
      setBusy('');
    }
  };

  const find = async () => {
    const answer = await run('scan', () => api.browserSignIns('scan'));
    if (answer?.browsers) {
      setScan(answer);
      setChosen(defaultChoice(answer.browsers));
      setResult(null);
    }
  };

  const sources = (scan?.browsers ?? [])
    .filter((b) => chosen[keyOf(b)])
    .map(({ browser, profile }) => ({ browser, profile }));

  const use = async () => {
    const answer = await run('import', () =>
      api.browserSignIns('import', { sources })
    );
    if (answer?.services) {
      setResult(answer);
      onImported?.(answer);
    }
  };

  const openAccess = () =>
    run('access', () => api.browserSignIns('full-disk-access'));

  const access = fullDiskAccessNeeded(scan, status);

  return el(
    'section',
    {
      className: 'card sign-ins glass',
      'data-tutorial-id': 'connections:sign-ins',
      'aria-labelledby': 'sign-ins-title',
      'aria-busy': busy ? 'true' : 'false',
    },
    [
      el(SignInsHeader, { key: 'h' }),
      el('p', { key: 'intro', className: 'meta' }, t('signIns.intro')),
      scan
        ? el(BrowserList, {
            key: 'list',
            browsers: scan.browsers ?? [],
            chosen,
            onToggle: (key) =>
              setChosen((prev) => ({ ...prev, [key]: !prev[key] })),
          })
        : null,
      access
        ? el(FullDiskAccess, { key: 'fda', access, onOpen: openAccess })
        : null,
      el(SignInsActions, {
        key: 'actions',
        scanned: Boolean(scan),
        busy,
        canUse: sources.length > 0,
        onFind: find,
        onUse: use,
      }),
      error
        ? el('p', { key: 'error', className: 'meta', role: 'alert' }, error)
        : null,
      result ? el(ImportResult, { key: 'result', result }) : null,
    ]
  );
};
