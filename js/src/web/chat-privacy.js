// Privacy and security of the connected Telegram account, as Telegram
// Desktop's Settings → Privacy and Security has it (R-Y139; learned, never
// copied): who can see the phone number, last seen, photos, bio, birthday,
// forwards, calls, voice messages and invitations (Everybody, My contacts,
// Nobody; the exceptions are counted, not edited), the active sessions with
// Terminate (each behind a confirmation in the page, never for this
// device), and the blocked users with Unblock. Telegram's refusals show as
// text.

import React, { useCallback, useEffect, useState } from 'react';
import { useT, useLocaleContext } from './i18n.js';
import { FormDialog } from './chat-create.js';

const el = React.createElement;

const KEY_ORDER = [
  'phoneNumber',
  'addedByPhone',
  'lastSeen',
  'profilePhoto',
  'about',
  'birthday',
  'forwards',
  'calls',
  'voiceMessages',
  'invites',
];

/** A Telegram refusal's code as text. */
export const errorText = (t, code) => {
  const key = `chat.privacy.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.privacy.err.failed') : text;
};

/**
 * The keys to list: "who can find me by my number" only when the phone
 * number is Nobody, as Telegram Desktop shows it; the page's order.
 */
export const visibleKeys = (keys) => {
  const phone = keys.find((k) => k.key === 'phoneNumber');
  return [...keys]
    .filter((k) => k.key !== 'addedByPhone' || phone?.choice === 'nobody')
    .sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));
};

// One request's answer, asked once; `reload` asks again.
const useAsked = (ask) => {
  const [state, setState] = useState({ phase: 'loading' });
  const load = useCallback(() => {
    let live = true;
    ask()
      .then(
        (a) => live && setState(a?.ok ? { phase: 'ready', data: a } : failed(a))
      )
      .catch(() => live && setState({ phase: 'error', code: 'failed' }));
    return () => {
      live = false;
    };
  }, [ask]);
  useEffect(() => load(), [load]);
  return [state, setState];
};
const failed = (a) => ({ phase: 'error', code: a?.code ?? 'failed' });

const Message = ({ t, state }) =>
  state.phase === 'loading'
    ? el('p', { className: 'meta' }, t('chat.privacy.loading'))
    : el(
        'p',
        { className: 'chat-form-error', role: 'alert' },
        errorText(t, state.code)
      );

const choiceLabel = (t, row) =>
  row.choice === 'other'
    ? t(`chat.privacy.label.${row.label}`)
    : t(`chat.privacy.choice.${row.choice}`);

const RuleRow = ({ t, row, onChange, busy }) =>
  el('div', { className: 'privacy-row', 'data-privacy-key': row.key }, [
    el('label', { key: 'l', className: 'privacy-label' }, [
      el('span', { key: 't' }, t(`chat.privacy.key.${row.key}`)),
      el(
        'select',
        {
          key: 's',
          'data-field': `privacy-${row.key}`,
          value: row.choice,
          disabled: busy,
          onChange: (e) => onChange(row.key, e.target.value),
        },
        [
          ...(row.choice === 'other'
            ? [
                el(
                  'option',
                  { key: 'o', value: 'other', disabled: true },
                  choiceLabel(t, row)
                ),
              ]
            : []),
          ...row.options.map((choice) =>
            el(
              'option',
              { key: choice, value: choice },
              t(`chat.privacy.choice.${choice}`)
            )
          ),
        ]
      ),
    ]),
    row.allow + row.disallow > 0
      ? el(
          'span',
          { key: 'x', className: 'meta', 'data-exceptions': true },
          t('chat.privacy.exceptions', {
            allow: row.allow,
            disallow: row.disallow,
          })
        )
      : null,
  ]);

const Rules = ({ api, t, setError }) => {
  const ask = useCallback(() => api.telegramPrivacy(), [api]);
  const [state, setState] = useAsked(ask);
  const [busy, setBusy] = useState(false);
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  const change = async (key, choice) => {
    setBusy(true);
    const answer = await api
      .telegramPrivacySet({ key, choice })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      const { ok: _ok, ...row } = answer;
      setState({
        phase: 'ready',
        data: {
          ...state.data,
          keys: state.data.keys.map((k) => (k.key === key ? row : k)),
        },
      });
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  return el(
    'div',
    { className: 'privacy-rules' },
    visibleKeys(state.data.keys).map((row) =>
      el(RuleRow, { key: row.key, t, row, onChange: change, busy })
    )
  );
};

const when = (iso, locale) =>
  iso ? new Date(iso).toLocaleString(locale || undefined) : '';

const where = (s) =>
  [s.ip, [s.region, s.country].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');

const Confirm = ({ t, text, onYes, onNo, name }) =>
  el('div', { className: 'privacy-confirm', 'data-confirm': name }, [
    el('span', { key: 't' }, text),
    el(
      'button',
      {
        key: 'y',
        type: 'button',
        className: 'danger',
        'data-action': 'confirm-terminate',
        onClick: onYes,
      },
      t('chat.privacy.confirmYes')
    ),
    el(
      'button',
      {
        key: 'n',
        type: 'button',
        'data-action': 'cancel-terminate',
        onClick: onNo,
      },
      t('chat.privacy.confirmNo')
    ),
  ]);

const SessionRow = ({ t, locale, s, asking, ask, stop, end }) =>
  el('div', { className: 'privacy-session', 'data-session': s.hash }, [
    el('strong', { key: 'd' }, s.device || s.platform),
    el(
      'span',
      { key: 'a', className: 'meta' },
      [`${s.app} ${s.appVersion}`.trim(), s.platform, s.system]
        .filter(Boolean)
        .join(' · ')
    ),
    el('span', { key: 'w', className: 'meta' }, where(s)),
    el(
      'span',
      { key: 't', className: 'meta' },
      s.current
        ? t('chat.privacy.thisDevice')
        : t('chat.privacy.lastActive', { date: when(s.active, locale) })
    ),
    s.current
      ? null
      : asking
        ? el(Confirm, {
            key: 'c',
            t,
            name: 'one',
            text: t('chat.privacy.confirmOne'),
            onYes: () => end(s.hash),
            onNo: stop,
          })
        : el(
            'button',
            {
              key: 'b',
              type: 'button',
              'data-action': 'terminate',
              onClick: () => ask(s.hash),
            },
            t('chat.privacy.terminate')
          ),
  ]);

// "Terminate all other sessions", behind its own confirmation.
const OthersButton = ({ t, asking, ask, stop, end }) =>
  asking
    ? el(Confirm, {
        t,
        name: 'others',
        text: t('chat.privacy.confirmOthers'),
        onYes: end,
        onNo: stop,
      })
    : el(
        'button',
        {
          type: 'button',
          'data-action': 'terminate-others',
          onClick: ask,
        },
        t('chat.privacy.terminateOthers')
      );

const Sessions = ({ api, t, setError }) => {
  const { locale } = useLocaleContext();
  const ask = useCallback(() => api.telegramAuthorizations(), [api]);
  const [state, setState] = useAsked(ask);
  // The hash being confirmed, 'others', or null.
  const [asking, setAsking] = useState(null);
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  const { sessions, ttlDays } = state.data;
  const done = (answer, keep) => {
    setAsking(null);
    if (answer?.ok) {
      setError(null);
      setState({
        phase: 'ready',
        data: { ...state.data, sessions: sessions.filter(keep) },
      });
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  const endOne = async (hash) =>
    done(
      await api.telegramSessionTerminate({ hash }).catch(() => null),
      (s) => s.hash !== hash
    );
  const endOthers = async () =>
    done(
      await api.telegramSessionsTerminateOthers().catch(() => null),
      (s) => s.current
    );
  return el('div', { className: 'privacy-sessions' }, [
    ...sessions.map((s) =>
      el(SessionRow, {
        key: s.hash,
        t,
        locale,
        s,
        asking: asking === s.hash,
        ask: setAsking,
        stop: () => setAsking(null),
        end: endOne,
      })
    ),
    sessions.some((s) => !s.current)
      ? el(OthersButton, {
          key: 'o',
          t,
          asking: asking === 'others',
          ask: () => setAsking('others'),
          stop: () => setAsking(null),
          end: endOthers,
        })
      : null,
    ttlDays > 0
      ? el(
          'p',
          { key: 'ttl', className: 'meta', 'data-ttl-days': ttlDays },
          t('chat.privacy.ttl', { days: ttlDays })
        )
      : null,
  ]);
};

const PAGE = 50;

const Blocked = ({ api, t, setError }) => {
  const [state, setState] = useState({ phase: 'loading' });
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const more = useCallback(
    async (offset) => {
      const a = await api
        .telegramBlocked({ offset, limit: PAGE })
        .catch(() => null);
      if (a?.ok) {
        setItems((was) => (offset === 0 ? a.items : [...was, ...a.items]));
        setNext(a.next);
        setState({ phase: 'ready' });
      } else {
        setState(failed(a));
      }
    },
    [api]
  );
  useEffect(() => {
    more(0);
  }, [more]);
  const unblock = async (item) => {
    const a = await api
      .telegramUnblock({ id: item.id, accessHash: item.accessHash })
      .catch(() => null);
    if (a?.ok) {
      setError(null);
      setItems((was) => was.filter((i) => i.id !== item.id));
    } else {
      setError(errorText(t, a?.code));
    }
  };
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  return el('div', { className: 'privacy-blocked' }, [
    items.length === 0
      ? el('p', { key: 'n', className: 'meta' }, t('chat.privacy.noBlocked'))
      : null,
    ...items.map((item) =>
      el(
        'div',
        {
          key: item.id,
          className: 'privacy-blocked-row',
          'data-blocked': item.id,
        },
        [
          el('span', { key: 'n' }, item.name || item.username || item.id),
          el(
            'button',
            {
              key: 'u',
              type: 'button',
              'data-action': 'unblock',
              onClick: () => unblock(item),
            },
            t('chat.privacy.unblock')
          ),
        ]
      )
    ),
    next === null
      ? null
      : el(
          'button',
          {
            key: 'm',
            type: 'button',
            'data-action': 'more-blocked',
            onClick: () => more(next),
          },
          t('chat.privacy.more')
        ),
  ]);
};

const Section = ({ title, name, children }) =>
  el('section', { className: 'privacy-section', 'data-section': name }, [
    el('h4', { key: 'h' }, title),
    children,
  ]);

/** The dialog: privacy rules, active sessions, blocked users. */
export const PrivacyDialog = ({ api, close }) => {
  const t = useT();
  const [error, setError] = useState(null);
  const props = { api, t, setError };
  return el(
    FormDialog,
    {
      name: 'privacy',
      title: t('chat.privacy.title'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.privacy.done'),
      busy: false,
      error,
      outside: true,
    },
    [
      el(
        Section,
        { key: 'r', name: 'rules', title: t('chat.privacy.rules') },
        el(Rules, props)
      ),
      el(
        Section,
        { key: 's', name: 'sessions', title: t('chat.privacy.sessions') },
        el(Sessions, props)
      ),
      el(
        Section,
        { key: 'b', name: 'blocked', title: t('chat.privacy.blocked') },
        el(Blocked, props)
      ),
    ]
  );
};
