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
import { Icon } from '../icons.js';
import { RecommendedHeader } from './recommended.js';

const el = React.createElement;

// Tell the tutorial (and anyone else listening) that a service just
// connected, so the tour can advance past its "connect a service" step
// no matter how the user connected — a saved session, a phone login, a
// bot token or API keys all fire the same event.
export const announceConnected = () =>
  globalThis.dispatchEvent?.(new CustomEvent('meta-sovereign:connected'));

// A small check mark that means "this credential was confirmed with
// Telegram". It replaces the old text badge; the words live in a tooltip
// (a styled CSS tooltip, with `aria-label` for screen readers) so the row
// stays compact. Shared so every confirmed credential uses the same mark.
export const VerifiedMark = ({ labelKey = 'telegramSessions.verified' }) => {
  const t = useT();
  const label = t(labelKey);
  // `data-tooltip` drives a CSS tooltip (reliable and styled, unlike the
  // native `title`, which is slow to appear and easy to miss); `aria-label`
  // keeps the words available to screen readers. `tabIndex` lets keyboard
  // users surface the tooltip with focus too.
  return el(
    'span',
    {
      className: 'verified-mark',
      role: 'img',
      tabIndex: 0,
      'aria-label': label,
      'data-tooltip': label,
    },
    el(Icon, { name: 'check', size: 14 })
  );
};

// Each entry is one distinct credential (the same token found in ten repos
// is one row). Its TYPE says how connecting works: a bot token, a login by
// saved session, or a login by phone & password.
const TYPE_LABEL = {
  bot: 'telegramSessions.typeBot',
  session: 'telegramSessions.typeSession',
  'user-password': 'telegramSessions.typePassword',
};

// Where the credential was found. The shortest path leads (the finder sorts
// `wheres` by length); the rest hide behind a "+N more" toggle so a widely
// copied token does not flood the row, and expand to the full list on click.
const WhereLine = ({ entry }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wheres = entry.wheres ?? [entry.where];
  const extra = wheres.length - 1;
  const toggle =
    extra > 0
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: 'meta tg-session-more',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen((v) => !v),
          },
          open
            ? t('telegramSessions.less')
            : t('telegramSessions.more').replace('{n}', String(extra))
        )
      : null;
  if (open) {
    return el('span', { className: 'tg-session-where' }, [
      el(
        'ul',
        { key: 'list', className: 'tg-session-where-list' },
        wheres.map((where, index) =>
          el('li', { key: index, className: 'tg-session-where-item' }, where)
        )
      ),
      toggle,
    ]);
  }
  return el('span', { className: 'tg-session-where' }, [
    el('span', { key: 'first' }, wheres[0]),
    toggle ? el('span', { key: 'sp' }, ' ') : null,
    toggle,
  ]);
};

// One labelled `telegramLogin.*` input, shared by the manual login form and
// the finder's inline phone-login so the markup lives in a single place.
const CredentialField = ({
  id,
  type,
  value,
  placeholder,
  dataField,
  onChange,
}) => {
  const t = useT();
  return el('label', { key: id, className: 'col provider-credential-row' }, [
    el('span', { key: 'l' }, t(`telegramLogin.${id}`)),
    el('input', {
      key: 'i',
      type: type ?? 'text',
      value: value ?? '',
      placeholder,
      autoComplete: 'off',
      'data-field': dataField ?? id,
      onChange: (e) => onChange(e.target.value),
    }),
  ]);
};

// The inline sign-in a phone & password login needs: Connect starts it on
// the server (which already holds the api_id/api_hash/phone), then the user
// types the code Telegram sent and, if set, their 2FA password — right here,
// without leaving the list.
const EntryLogin = ({ login, onField, onSubmit, busy }) => {
  const t = useT();
  const field = (id, type) =>
    el(CredentialField, {
      key: id,
      id,
      type,
      value: login[id],
      dataField: `entry-${id}`,
      onChange: (value) => onField(id, value),
    });
  return el('div', { className: 'tg-session-login' }, [
    el(
      'p',
      { key: 'sent', className: 'meta' },
      t(
        login.needs === 'password'
          ? 'telegramLogin.twoFactor'
          : 'telegramLogin.codeSent'
      )
    ),
    login.needs === 'code' ? field('code') : null,
    login.needs === 'password' ? field('password', 'password') : null,
    el(
      'button',
      {
        key: 'go',
        type: 'button',
        className: 'primary',
        'data-action': 'telegram-session-login',
        disabled: Boolean(busy),
        'aria-busy': busy ? 'true' : undefined,
        onClick: onSubmit,
      },
      t(busy ? 'telegramLogin.working' : 'telegramLogin.signIn')
    ),
    login.error
      ? el('p', { key: 'e', className: 'meta', role: 'alert' }, login.error)
      : null,
  ]);
};

const EntryRow = ({
  entry,
  busy,
  login,
  connected,
  onUse,
  onField,
  onSubmit,
}) => {
  const t = useT();
  const connectable = entry.kind !== 'telethon-session';
  const meta = [
    t(TYPE_LABEL[entry.type] ?? 'telegramSessions.typeSession'),
    entry.hint,
  ]
    .filter(Boolean)
    .join(' · ');
  return el('li', { className: 'tg-session-entry', 'data-kind': entry.kind }, [
    el('span', { key: 'text', className: 'tg-session-text' }, [
      el(WhereLine, { key: 'where', entry }),
      el('span', { key: 'meta', className: 'meta tg-session-meta' }, meta),
    ]),
    connected
      ? el(
          'span',
          {
            key: 'done',
            className: 'meta tg-session-connected',
            'data-connected': entry.id,
            role: 'status',
          },
          t('telegramSessions.connected')
        )
      : login
        ? el(EntryLogin, { key: 'login', login, onField, onSubmit, busy })
        : connectable
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
              t(
                entry.type === 'user-password'
                  ? 'telegramSessions.signIn'
                  : 'telegramSessions.connect'
              )
            )
          : el(
              'span',
              { key: 'manual', className: 'meta' },
              t('telegramSessions.telethonHint')
            ),
  ]);
};

const AccountGroup = ({
  group,
  busy,
  logins,
  connected,
  onUse,
  onField,
  onSubmit,
}) => {
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
      account.verified ? el(VerifiedMark, { key: 'ok' }) : null,
    ]),
    el(
      'ul',
      { key: 'list', className: 'tg-session-entries' },
      group.entries.map((entry) =>
        el(EntryRow, {
          key: entry.id,
          entry,
          busy: busy === entry.id,
          login: logins[entry.id] ?? null,
          connected: Boolean(connected[entry.id]),
          onUse,
          onField: (field, value) => onField(entry.id, field, value),
          onSubmit: () => onSubmit(entry.id),
        })
      )
    ),
  ]);
};

// The scan dedupes every discovered credential, checks each one is still
// live, resolves user sessions to their phone/@username, and groups them by
// account — so the list shows one connectable entry per real sign-in.
const useFinder = (onConnected) => {
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  // Phone-logins that have started an inline sign-in: id -> { needs, code,
  // password, error }.
  const [logins, setLogins] = useState({});
  // Entries whose credential is now stored (bot/session): id -> result. Shown
  // as a "Connected" badge so the click is not silent.
  const [connected, setConnected] = useState({});
  const patch = (id, next) =>
    setLogins((all) => ({ ...all, [id]: { ...all[id], ...next } }));

  const find = async () => {
    setBusy('scan');
    setError('');
    setLogins({});
    setConnected({});
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
    // A phone & password login: reveal the inline code/2FA step, keeping
    // the server-side login id to submit the code against.
    if (result.needsLogin) {
      patch(id, {
        needs: result.needs ?? 'code',
        loginId: result.id,
        error: '',
      });
      return;
    }
    // A bot token or saved session: it is now stored. Mark it so the row
    // shows "Connected" instead of leaving the click without any feedback.
    setConnected((all) => ({ ...all, [id]: result }));
    announceConnected();
    await onConnected?.();
  };

  const field = (id, key, value) => patch(id, { [key]: value });

  const submit = async (id) => {
    const login = logins[id] ?? {};
    setBusy(id);
    const action = login.needs === 'password' ? 'password' : 'code';
    const result = await api.telegramLogin(action, {
      id: login.loginId ?? id,
      code: login.code,
      password: login.password,
    });
    setBusy('');
    if (result?.error) {
      patch(id, { error: result.error });
      return;
    }
    if (result.done) {
      setLogins((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
      setConnected((all) => ({ ...all, [id]: result }));
      announceConnected();
      await onConnected?.();
      return;
    }
    patch(id, { needs: result.needs ?? 'code', error: '' });
  };

  return {
    groups,
    busy,
    error,
    scanned,
    logins,
    connected,
    find,
    use,
    field,
    submit,
  };
};

// Sign in to a Telegram USER account over MTProto, like konard/telegram-bot:
// api_id + api_hash + phone -> a login code -> an optional 2FA password ->
// a reusable session stored under secret:telegram:*.
const LoginField = ({ id, type, value, onChange, placeholder }) =>
  el(CredentialField, { id, type, value, placeholder, onChange });

const useTelegramLogin = (onConnected, slot = 1) => {
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
      announceConnected();
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
        // An extra account signs in to its own slot (R-Y198).
        ...(slot > 1 ? { account: slot } : {}),
      }),
    submitCode: () => run('code', { id: idRef.current, code: form.code }),
    submitPassword: () =>
      run('password', { id: idRef.current, password: form.password }),
  };
};

export const TelegramLoginForm = ({ onConnected, account = 1 }) => {
  const t = useT();
  const l = useTelegramLogin(onConnected, account);
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
    {
      className: 'card tg-login',
      'data-tutorial-id': 'telegram-login',
      ...(account > 1 ? { 'data-login-account': account } : {}),
    },
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
          'aria-busy': l.busy ? 'true' : undefined,
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
  const {
    groups,
    busy,
    error,
    scanned,
    logins,
    connected,
    find,
    use,
    field,
    submit,
  } = useFinder(onConnected);
  const empty = scanned && (groups?.length ?? 0) === 0;
  return el(
    'section',
    {
      className: 'card tg-sessions',
      'data-tutorial-id': 'telegram-sessions',
      'aria-busy': busy ? 'true' : 'false',
    },
    [
      el(RecommendedHeader, {
        key: 'h',
        tag: 'h3',
        titleKey: 'telegramSessions.title',
        className: 'tg-sessions-head',
      }),
      el('p', { key: 'intro', className: 'meta' }, t('telegramSessions.intro')),
      el(
        'button',
        {
          key: 'scan',
          type: 'button',
          className: groups ? '' : 'primary',
          'data-action': 'telegram-session-scan',
          disabled: busy === 'scan',
          'aria-busy': busy === 'scan' ? 'true' : undefined,
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
                logins,
                connected,
                onUse: use,
                onField: field,
                onSubmit: submit,
              })
            )
          )
        : null,
    ]
  );
};
