// "Find Telegram sessions on this computer" (Telegram -> Enter manually).
//
// People who experiment with Telegram leave their own credentials in many
// repositories: a bot token in one project's `.env`, a GramJS user string
// session saved beside another, an api_id/api_hash trio in a third. This
// panel asks the local server to find them (read-only), groups them by the
// account they belong to, and connects the one the user picks. The browser
// only ever sees kinds, paths and masked hints — never a token or session.

import React, { useRef, useState } from 'react';
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

// The scan groups results from the files alone — no network — so they
// appear at once and a slow or offline Telegram can never block them.
const useFinder = (onConnected) => {
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);

  const find = async () => {
    setBusy('scan');
    setError('');
    const scan = await api.telegramSessions('scan');
    setBusy('');
    setScanned(true);
    if (scan?.error) {
      setError(scan.error);
      return;
    }
    setGroups(scan.groups ?? []);
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

// Sign in to a Telegram USER account over MTProto, like konard/telegram-bot:
// api_id + api_hash + phone -> a login code -> an optional 2FA password ->
// a reusable session stored under secret:telegram:*.
const LoginField = ({ id, type, value, onChange, placeholder }) => {
  const t = useT();
  return el('label', { className: 'col provider-credential-row' }, [
    el('span', { key: 'l' }, t(`telegramLogin.${id}`)),
    el('input', {
      key: 'i',
      type: type ?? 'text',
      value,
      placeholder,
      autoComplete: 'off',
      'data-field': id,
      onChange: (e) => onChange(e.target.value),
    }),
  ]);
};

const useTelegramLogin = (onConnected) => {
  const [form, setForm] = useState({
    apiId: '',
    apiHash: '',
    phone: '',
    code: '',
    password: '',
  });
  const [needs, setNeeds] = useState('start'); // start | code | password | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(null);
  const idRef = useRef(null); // the login id returned by `start`
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const apply = (result) => {
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result.id) {
      idRef.current = result.id;
    }
    if (result.done) {
      setNeeds('done');
      setAccount(result.account);
      onConnected?.();
      return;
    }
    setNeeds(result.needs ?? 'code');
  };

  const run = async (action, body) => {
    setBusy(true);
    setError('');
    const result = await api.telegramLogin(action, body);
    setBusy(false);
    apply(result);
  };

  return {
    form,
    set,
    needs,
    busy,
    error,
    account,
    start: () =>
      run('start', {
        apiId: form.apiId,
        apiHash: form.apiHash,
        phone: form.phone,
      }),
    submitCode: () => run('code', { id: idRef.current, code: form.code }),
    submitPassword: () =>
      run('password', { id: idRef.current, password: form.password }),
  };
};

export const TelegramLoginForm = ({ onConnected }) => {
  const t = useT();
  const l = useTelegramLogin(onConnected);
  if (l.needs === 'done') {
    return el('section', { className: 'card tg-login tg-login-done' }, [
      el('strong', { key: 't' }, t('telegramLogin.connected')),
      el(
        'p',
        { key: 'a', className: 'meta' },
        l.account?.username ? `@${l.account.username}` : t('telegramLogin.you')
      ),
    ]);
  }
  const action =
    l.needs === 'password'
      ? { key: 'telegramLogin.signIn', on: l.submitPassword }
      : l.needs === 'code'
        ? { key: 'telegramLogin.signIn', on: l.submitCode }
        : { key: 'telegramLogin.sendCode', on: l.start };
  return el(
    'section',
    { className: 'card tg-login', 'data-tutorial-id': 'telegram-login' },
    [
      el('header', { key: 'h', className: 'tg-login-head' }, [
        el('h3', { key: 't' }, t('telegramLogin.title')),
        el('p', { key: 'i', className: 'meta' }, t('telegramLogin.intro')),
      ]),
      el(LoginField, {
        key: 'apiId',
        id: 'apiId',
        value: l.form.apiId,
        onChange: l.set('apiId'),
        placeholder: '2040',
      }),
      el(LoginField, {
        key: 'apiHash',
        id: 'apiHash',
        type: 'password',
        value: l.form.apiHash,
        onChange: l.set('apiHash'),
        placeholder: '0123456789abcdef…',
      }),
      el(LoginField, {
        key: 'phone',
        id: 'phone',
        value: l.form.phone,
        onChange: l.set('phone'),
        placeholder: '+1 555 123 4567',
      }),
      l.needs === 'code' || l.needs === 'password'
        ? el(LoginField, {
            key: 'code',
            id: 'code',
            value: l.form.code,
            onChange: l.set('code'),
            placeholder: '12345',
          })
        : null,
      l.needs === 'password'
        ? el(LoginField, {
            key: 'password',
            id: 'password',
            type: 'password',
            value: l.form.password,
            onChange: l.set('password'),
            placeholder: '••••••••',
          })
        : null,
      el(
        'button',
        {
          key: 'go',
          type: 'button',
          className: 'primary',
          'data-action': 'telegram-login',
          disabled: l.busy,
          onClick: action.on,
        },
        t(l.busy ? 'telegramLogin.working' : action.key)
      ),
      l.error
        ? el('p', { key: 'e', className: 'meta', role: 'alert' }, l.error)
        : null,
    ]
  );
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
