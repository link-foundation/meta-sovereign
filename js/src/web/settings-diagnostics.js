import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { followDiagnosticLogs } from './diagnostic-log-feed.js';
import { DiagnosticConfiguration } from './diagnostic-configuration.js';

const el = React.createElement;
const LiveLogs = ({ api }) => {
  const t = useT();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(
    () =>
      followDiagnosticLogs({
        read: api.diagnosticLogs,
        update: (snapshot) => {
          setData(snapshot);
          setFailed(false);
        },
        fail: () => setFailed(true),
      }),
    [api]
  );
  const text = data?.items.map((item) => item.text).join('\n') ?? '';
  const copy = async () => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) {
        throw new Error('clipboard unavailable');
      }
      await globalThis.navigator.clipboard.writeText(text);
      setCopied('copied');
    } catch {
      setCopied('copyFailed');
    }
  };
  return el('div', { className: 'col', 'data-diagnostic-logs': '' }, [
    el(
      'p',
      { key: 'state', role: 'status' },
      t(`diagnostics.${failed ? 'unavailable' : data ? 'live' : 'loading'}`)
    ),
    data?.gap
      ? el('p', { key: 'gap', role: 'status' }, t('diagnostics.gap'))
      : null,
    el(
      'button',
      {
        key: 'copy',
        type: 'button',
        disabled: !text,
        onClick: copy,
        'data-action': 'diagnostics-copy',
      },
      t('diagnostics.copy')
    ),
    copied
      ? el('p', { key: 'copied', role: 'status' }, t(`diagnostics.${copied}`))
      : null,
    el(
      'pre',
      {
        key: 'logs',
        className: 'diagnostic-log-text',
        tabIndex: 0,
        'aria-label': t('diagnostics.title'),
      },
      text || t('diagnostics.empty')
    ),
  ]);
};

export const DiagnosticSettings = ({ api }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return el('section', { className: 'card diagnostics-settings' }, [
    el('h3', { key: 'h' }, t('diagnostics.title')),
    el('p', { key: 'hint', className: 'meta' }, t('diagnostics.hint')),
    el(
      'details',
      {
        key: 'details',
        onToggle: (event) => setOpen(event.currentTarget.open),
      },
      [
        el(
          'summary',
          { key: 'summary', 'data-action': 'diagnostics-open' },
          t('diagnostics.show')
        ),
        open && api.diagnosticSettings
          ? el(DiagnosticConfiguration, { key: 'configuration', api })
          : null,
        open ? el(LiveLogs, { key: 'live', api }) : null,
      ]
    ),
  ]);
};
