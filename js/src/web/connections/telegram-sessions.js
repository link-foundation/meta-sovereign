// "Find Telegram sessions on this computer" (Telegram -> Enter manually).
//
// People who experiment with Telegram leave their own credentials in many
// repositories: a bot token in one project's `.env`, a GramJS user string
// session saved beside another, an api_id/api_hash trio in a third. This
// panel asks the local server to find them (read-only), groups them by the
// account they belong to, and connects the one the user picks. The browser
// only ever sees kinds, paths and masked hints — never a token or session.

import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';

const el = React.createElement;

const KIND_LABEL = {
  'bot-token': 'telegramSessions.kindBot',
  'user-session': 'telegramSessions.kindUser',
  'telethon-session': 'telegramSessions.kindTelethon',
};

const EntryRow = ({ entry, busy, onUse }) => {
  const t = useT();
  const connectable = entry.kind !== 'telethon-session';
  return el('li', { className: 'tg-session-entry', 'data-kind': entry.kind }, [
    el('span', { key: 'text', className: 'tg-session-text' }, [
      el('span', { key: 'where', className: 'tg-session-where' }, entry.where),
      el(
        'span',
        { key: 'meta', className: 'meta tg-session-meta' },
        [
          t(KIND_LABEL[entry.kind] ?? 'telegramSessions.kindUser'),
          entry.hint,
          entry.phone,
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    ]),
    connectable
      ? el(
          'button',
          {
            key: 'use',
            type: 'button',
            className: 'primary tg-session-use',
            'data-action': 'telegram-session-use',
            'data-entry': entry.id,
            disabled: Boolean(busy),
            onClick: () => onUse(entry.id),
          },
          t('telegramSessions.connect')
        )
      : el(
          'span',
          { key: 'manual', className: 'meta' },
          t('telegramSessions.telethonHint')
        ),
  ]);
};

const AccountGroup = ({ group, busy, onUse }) => {
  const t = useT();
  const { account } = group;
  return el('section', { className: 'tg-session-group' }, [
    el('header', { key: 'h', className: 'row tg-session-group-head' }, [
      el('strong', { key: 'label' }, account.label),
      el(
        'span',
        {
          key: 'tag',
          className: `meta tg-session-badge tg-session-${account.kind}`,
        },
        t(
          account.kind === 'bot'
            ? 'telegramSessions.badgeBot'
            : 'telegramSessions.badgeUser'
        )
      ),
      account.verified
        ? el(
            'span',
            { key: 'ok', className: 'meta tg-session-verified' },
            t('telegramSessions.verified')
          )
        : null,
    ]),
    el(
      'ul',
      { key: 'list', className: 'tg-session-entries' },
      group.entries.map((entry) =>
        el(EntryRow, { key: entry.id, entry, busy, onUse })
      )
    ),
  ]);
};

// Report a scan/identify result that may be an error envelope.
const useFinder = (onConnected) => {
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);

  const find = async () => {
    setBusy('scan');
    setError('');
    const scan = await api.telegramSessions('scan');
    if (scan?.error) {
      setError(scan.error);
      setBusy('');
      return;
    }
    const identified = await api.telegramSessions('identify');
    setBusy('');
    setScanned(true);
    if (identified?.error) {
      setError(identified.error);
      return;
    }
    setGroups(identified.groups ?? []);
  };

  const use = async (id) => {
    setBusy(id);
    setError('');
    const result = await api.telegramSessions('use', { id });
    setBusy('');
    if (result?.error) {
      setError(result.error);
      return;
    }
    await onConnected?.();
  };

  return { groups, busy, error, scanned, find, use };
};

export const TelegramSessionsPanel = ({ onConnected }) => {
  const t = useT();
  const { groups, busy, error, scanned, find, use } = useFinder(onConnected);
  const empty = scanned && (groups?.length ?? 0) === 0;
  return el(
    'section',
    {
      className: 'card tg-sessions',
      'data-tutorial-id': 'telegram-sessions',
      'aria-busy': busy ? 'true' : 'false',
    },
    [
      el('header', { key: 'h', className: 'row tg-sessions-head' }, [
        el('h3', { key: 'title' }, t('telegramSessions.title')),
        el(
          'span',
          { key: 'tag', className: 'recommended-tag' },
          t('connections.recommended')
        ),
      ]),
      el('p', { key: 'intro', className: 'meta' }, t('telegramSessions.intro')),
      el(
        'button',
        {
          key: 'scan',
          type: 'button',
          className: groups ? '' : 'primary',
          'data-action': 'telegram-session-scan',
          disabled: busy === 'scan',
          onClick: find,
        },
        t(
          busy === 'scan'
            ? 'telegramSessions.scanning'
            : groups
              ? 'telegramSessions.rescan'
              : 'telegramSessions.scan'
        )
      ),
      error
        ? el('p', { key: 'err', className: 'meta', role: 'alert' }, error)
        : null,
      empty
        ? el(
            'p',
            { key: 'none', className: 'meta' },
            t('telegramSessions.none')
          )
        : null,
      groups?.length
        ? el(
            'div',
            { key: 'groups', className: 'tg-session-groups' },
            groups.map((group, index) =>
              el(AccountGroup, {
                key: group.account.label + index,
                group,
                busy,
                onUse: use,
              })
            )
          )
        : null,
    ]
  );
};
