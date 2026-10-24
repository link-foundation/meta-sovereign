// Settings → Advanced → Manage local storage, as Telegram Desktop has it
// (R-Y215; learned, never copied): the media the server cached for the
// connected Telegram account, by kind (photos, videos, voice messages,
// files, stickers and GIFs, other) with its size and file count and a
// "Clear" for each, "Clear all" (asked to be confirmed), the chats that
// take the most room, and two optional limits the server keeps by itself:
// "Maximum cache size" and "Clear media older than". Only the cache
// folder is touched — never the account, messages or exports.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { ConfirmDialog } from './settings-confirm.js';

const el = React.createElement;

export const KINDS = [
  'photos',
  'videos',
  'voice',
  'files',
  'stickers',
  'other',
];
export const MAX_GB = [0, 1, 5, 20];
export const OLDER_DAYS = [0, 7, 30, 365];
const CHATS_SHOWN = 10;

/** `1.5 GB`, `12.3 MB`, `640 KB`, `20 B`. */
export const bytesText = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) {
    return `${(n / 1024 ** 3).toFixed(1)} GB`;
  }
  if (n >= 1024 ** 2) {
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
};

const Row = ({ kind, row, onClear, t }) =>
  el('li', { className: 'storage-row', 'data-storage-kind': kind }, [
    el('span', { key: 'n', className: 'storage-name' }, t(`storage.${kind}`)),
    el(
      'span',
      { key: 's', className: 'meta', 'data-storage-size': kind },
      t('storage.size', {
        size: bytesText(row.bytes),
        count: row.files,
      })
    ),
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        'data-action': `storage-clear-${kind}`,
        disabled: row.files === 0,
        onClick: () => onClear(kind),
      },
      t('storage.clear')
    ),
  ]);

const LimitSelect = ({ action, label, value, options, text, onChange }) =>
  el('label', { className: 'media-limit' }, [
    el('span', { key: 'l' }, label),
    el(
      'select',
      {
        key: 's',
        'data-action': action,
        value,
        onChange: (event) => onChange(Number(event.target.value)),
      },
      options.map((n) => el('option', { key: n, value: n }, text(n)))
    ),
  ]);

const Limits = ({ limits, onChange, t }) => [
  el(LimitSelect, {
    key: 'max',
    action: 'storage-max',
    label: t('storage.max'),
    value: limits.maxGb,
    options: MAX_GB,
    text: (n) => (n === 0 ? t('storage.noLimit') : `${n} GB`),
    onChange: (maxGb) => onChange({ ...limits, maxGb }),
  }),
  el(LimitSelect, {
    key: 'older',
    action: 'storage-older',
    label: t('storage.older'),
    value: limits.olderDays,
    options: OLDER_DAYS,
    text: (n) => t(`storage.age.${n}`),
    onChange: (olderDays) => onChange({ ...limits, olderDays }),
  }),
];

const Panel = ({ api }) => {
  const t = useT();
  const [usage, setUsage] = useState(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const load = useCallback(
    () =>
      Promise.resolve(api.telegramStorageUsage())
        .then((answer) => {
          setFailed(!answer?.ok);
          if (answer?.ok) {
            setUsage(answer);
          }
        })
        .catch(() => setFailed(true)),
    [api]
  );
  useEffect(() => {
    load();
  }, [load]);
  const clear = (body) => {
    setAsking(false);
    Promise.resolve(api.telegramStorageClear(body))
      .then((answer) => (answer?.ok ? load() : setFailed(true)))
      .catch(() => setFailed(true));
  };
  const limit = (next) => {
    setUsage((u) => ({ ...u, limits: next }));
    Promise.resolve(api.telegramStorageLimitsSet(next))
      .then((answer) => (answer?.ok ? load() : setFailed(true)))
      .catch(() => setFailed(true));
  };
  if (!usage) {
    return failed
      ? el('p', { role: 'alert' }, t('storage.failed'))
      : el('p', { className: 'meta' }, t('common.loading'));
  }
  return el('div', { className: 'storage-panel', 'data-storage': 'panel' }, [
    el(
      'p',
      { key: 't', 'data-storage-total': true },
      t('storage.total', {
        size: bytesText(usage.total.bytes),
        count: usage.total.files,
      })
    ),
    el(
      'ul',
      { key: 'k', className: 'storage-kinds' },
      KINDS.map((kind) =>
        el(Row, {
          key: kind,
          kind,
          row: usage.kinds[kind],
          onClear: (k) => clear({ kind: k }),
          t,
        })
      )
    ),
    el(
      'button',
      {
        key: 'all',
        type: 'button',
        className: 'danger',
        'data-action': 'storage-clear-all',
        disabled: usage.total.files === 0,
        onClick: () => setAsking(true),
      },
      t('storage.clearAll')
    ),
    usage.chats.length > 0
      ? el('div', { key: 'c', className: 'storage-chats' }, [
          el('h4', { key: 'h' }, t('storage.chats')),
          el(
            'ul',
            { key: 'l' },
            usage.chats
              .slice(0, CHATS_SHOWN)
              .map((c) =>
                el('li', { key: c.chat, 'data-storage-chat': c.chat }, [
                  el('span', { key: 'n' }, t('storage.chat', { id: c.chat })),
                  el(
                    'span',
                    { key: 's', className: 'meta' },
                    ` ${bytesText(c.bytes)}`
                  ),
                ])
              )
          ),
        ])
      : null,
    ...Limits({ limits: usage.limits, onChange: limit, t }),
    el('p', { key: 'h', className: 'meta' }, t('storage.hint')),
    failed ? el('p', { key: 'f', role: 'alert' }, t('storage.failed')) : null,
    asking
      ? el(ConfirmDialog, {
          key: 'd',
          name: 'storage-clear-all',
          title: t('storage.clearAll'),
          text: t('storage.clearAllAsk'),
          yes: t('storage.clear'),
          onYes: () => clear({ all: true }),
          onNo: () => setAsking(false),
        })
      : null,
  ]);
};

/** Advanced: the button that opens the cache's management. */
export const StorageSettings = ({ api }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (typeof api?.telegramStorageUsage !== 'function') {
    return null;
  }
  return el(
    'section',
    { className: 'card storage-settings', 'aria-labelledby': 'storage-title' },
    [
      el('h3', { key: 'h', id: 'storage-title' }, t('storage.advanced')),
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          'data-action': 'storage-open',
          'aria-expanded': open,
          onClick: () => setOpen(!open),
        },
        t('storage.manage')
      ),
      open ? el(Panel, { key: 'p', api }) : null,
    ]
  );
};
