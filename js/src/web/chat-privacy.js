// Privacy and security of the connected Telegram account, as Telegram
// Desktop's Settings → Privacy and Security has it (R-Y139; learned, never
// copied): who can see the phone number, last seen, photos, bio, birthday,
// forwards, calls, voice messages and invitations (Everybody, My contacts,
// Nobody; the exceptions are counted, not edited), the active sessions with
// Terminate (each behind a confirmation in the page, never for this
// device), and the blocked users with Unblock. Telegram's refusals show as
// text. R-Y174 adds the archive and read-mark switches and the logged-in
// websites (each Disconnect asked in the page first).

import React, { useCallback, useEffect, useState } from 'react';
import { useT, useLocaleContext } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { TtlChoices, periodWords } from './chat-ttl.js';
import { DeleteAccountRow } from './chat-account-data.js';
import { CloseFriendsDialog } from './chat-contacts-edit.js';
import { LocalPasscode } from './chat-passcode.js';
import { PaidMessagesSetting } from './chat-privacy-paid.js';
import { ClearDrafts } from './chat-drafts-clear.js';
import {
  AccountTtl,
  SensitiveContent,
  SessionSwitches,
  SessionTtl,
  TwoStep,
  useSecurity,
} from './chat-security.js';

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

const Confirm = ({ t, text, onYes, onNo, name, yes }) =>
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
      yes ?? t('chat.privacy.confirmYes')
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

const SessionRow = ({ api, setError, t, locale, s, asking, ask, stop, end }) =>
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
    s.pending ? null : el(SessionSwitches, { key: 'sw', api, s, setError }),
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
        api,
        setError,
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
    ttlDays > 0
      ? el(SessionTtl, {
          key: 'ttl-edit',
          api,
          t,
          days: ttlDays,
          setError,
          onSaved: (days) =>
            setState({
              phase: 'ready',
              data: { ...state.data, ttlDays: days },
            }),
        })
      : null,
  ]);
};

// Archive and mute new chats, and two switches that belong to privacy
// (R-Y174): the five switches of Telegram's global privacy settings.
// One click on a switch sends all five (the server keeps the fields this
// page does not show); a refusal, PREMIUM_ACCOUNT_REQUIRED included, is
// shown as text and the switch stays as it was.
const ARCHIVE_SWITCHES = ['archiveAndMute', 'keepUnmuted', 'keepFolders'];
const PRIVACY_SWITCHES = ['hideReadMarks', 'requirePremium'];

const useArchiveSettings = (api, t, setError) => {
  const ask = useCallback(() => api.telegramArchiveSettings(), [api]);
  const [state, setState] = useAsked(ask);
  const [busy, setBusy] = useState(false);
  const toggle = async (key) => {
    const next = { ...state.data.settings, [key]: !state.data.settings[key] };
    setBusy(true);
    const answer = await api.telegramArchiveSettingsSet(next).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setState({ phase: 'ready', data: { ...state.data, ...answer } });
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  return { state, busy, toggle };
};

const SwitchGroup = ({ t, archive, names }) => {
  const { state, busy, toggle } = archive;
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  return el(
    'div',
    { className: 'privacy-switches' },
    names.map((key) =>
      el('label', { key, className: 'privacy-switch' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          role: 'switch',
          'data-field': `archive-${key}`,
          checked: state.data.settings[key],
          disabled: busy,
          onChange: () => toggle(key),
        }),
        el('span', { key: 's' }, t(`chat.archive.${key}`)),
        el(
          'span',
          { key: 'h', className: 'meta' },
          t(`chat.archive.${key}Hint`)
        ),
      ])
    )
  );
};

// Logged-in websites (R-Y174): each with its domain, bot, browser,
// platform, IP, region and last-active time; Disconnect and Disconnect
// all websites each ask in the page before anything is sent.
const siteSummary = (s) =>
  [s.bot, s.browser, s.platform].filter(Boolean).join(' · ');

const siteWhere = (s) => [s.ip, s.region].filter(Boolean).join(' · ');

const WebRow = ({ t, locale, s, asking, ask, stop, end }) =>
  el('div', { className: 'privacy-session', 'data-web-session': s.hash }, [
    el('strong', { key: 'd' }, s.domain),
    el('span', { key: 'a', className: 'meta' }, siteSummary(s)),
    el('span', { key: 'w', className: 'meta' }, siteWhere(s)),
    el(
      'span',
      { key: 't', className: 'meta' },
      t('chat.privacy.lastActive', { date: when(s.active, locale) })
    ),
    asking
      ? el(Confirm, {
          key: 'c',
          t,
          name: 'web-one',
          text: t('chat.web.confirmOne', { domain: s.domain }),
          yes: t('chat.web.disconnect'),
          onYes: () => end(s.hash),
          onNo: stop,
        })
      : el(
          'button',
          {
            key: 'b',
            type: 'button',
            'data-action': 'web-disconnect',
            onClick: () => ask(s.hash),
          },
          t('chat.web.disconnect')
        ),
  ]);

const WebAll = ({ t, asking, ask, stop, end }) =>
  asking
    ? el(Confirm, {
        t,
        name: 'web-all',
        text: t('chat.web.confirmAll'),
        yes: t('chat.web.disconnectAll'),
        onYes: end,
        onNo: stop,
      })
    : el(
        'button',
        { type: 'button', 'data-action': 'web-disconnect-all', onClick: ask },
        t('chat.web.disconnectAll')
      );

const WebSessions = ({ api, t, setError }) => {
  const { locale } = useLocaleContext();
  const ask = useCallback(() => api.telegramWebSessions(), [api]);
  const [state, setState] = useAsked(ask);
  // The hash being confirmed, 'all', or null.
  const [asking, setAsking] = useState(null);
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  const { sessions } = state.data;
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
      await api.telegramWebSessionReset({ hash }).catch(() => null),
      (s) => s.hash !== hash
    );
  const endAll = async () =>
    done(
      await api.telegramWebSessionsResetAll().catch(() => null),
      () => false
    );
  return el('div', { className: 'privacy-web-sessions' }, [
    sessions.length === 0
      ? el('p', { key: 'n', className: 'meta' }, t('chat.web.none'))
      : null,
    ...sessions.map((s) =>
      el(WebRow, {
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
    sessions.length > 0
      ? el(WebAll, {
          key: 'all',
          t,
          asking: asking === 'all',
          ask: () => setAsking('all'),
          stop: () => setAsking(null),
          end: endAll,
        })
      : null,
  ]);
};

// The timer new chats start with (R-Y151): the current period, and a click
// opens the same choices as a chat's timer (Off, 1 day, 1 week, 1 month,
// "Other…" for the longer ones); Save sends the period.
const AutoDelete = ({ api, t, setError }) => {
  const ask = useCallback(() => api.telegramDefaultTtl(), [api]);
  const [state, setState] = useAsked(ask);
  const [open, setOpen] = useState(false);
  if (state.phase !== 'ready') {
    return el(Message, { t, state });
  }
  const period = state.data.period;
  return el('div', { className: 'privacy-ttl' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'default-ttl',
        'aria-expanded': open,
        onClick: () => setOpen(!open),
      },
      [
        t('chat.privacy.autoDelete'),
        el(
          'span',
          { key: 'p', className: 'meta ttl-now', 'data-default-ttl': period },
          ` ${periodWords(t, period)}`
        ),
      ]
    ),
    el('p', { key: 'h', className: 'meta' }, t('chat.privacy.autoDeleteHint')),
    open
      ? el(TtlChoices, {
          key: `c${period}`,
          current: period,
          save: (value) => api.telegramDefaultTtlSet({ period: value }),
          done: (value) => {
            setError(null);
            setOpen(false);
            setState({
              phase: 'ready',
              data: { ...state.data, period: value },
            });
          },
        })
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

// Close friends (R-Y169): a button that opens the editor over the dialog.
const CloseFriends = ({ api, t, setOpen }) => {
  if (typeof api?.telegramCloseFriends !== 'function') {
    return null;
  }
  return el('div', { className: 'privacy-close-friends' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.contactsEdit.closeHint')),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'open-close-friends',
        onClick: () => setOpen(true),
      },
      t('chat.contactsEdit.edit')
    ),
  ]);
};

const Section = ({ title, name, children }) =>
  el('section', { className: 'privacy-section', 'data-section': name }, [
    el('h4', { key: 'h' }, title),
    children,
  ]);

/** The dialog: privacy rules, active sessions, blocked users. */
const PrivacyForm = ({ api, close, friends, setFriends }) => {
  const t = useT();
  const [error, setError] = useState(null);
  const props = { api, t, setError };
  const archive = useArchiveSettings(api, t, setError);
  const sec = useSecurity(api);
  const secProps = { ...props, sec };
  return el(
    FormDialog,
    {
      name: 'privacy',
      title: t('chat.privacy.title'),
      onClose: friends ? () => {} : close,
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
        {
          key: 'hr',
          name: 'read-marks',
          title: t('chat.archive.privacyTitle'),
        },
        el(SwitchGroup, { t, archive, names: PRIVACY_SWITCHES })
      ),
      // Messages → Charge for messages from non-contacts (R-Y184).
      el(
        Section,
        { key: 'pm', name: 'paid-messages', title: t('chat.paidMsg.title') },
        el(PaidMessagesSetting, { api, setError })
      ),
      el(
        Section,
        { key: 'ts', name: 'two-step', title: t('chat.security.twoStep') },
        el(TwoStep, secProps)
      ),
      el(
        Section,
        { key: 'lp', name: 'local-passcode', title: t('passcode.title') },
        el(LocalPasscode, { api, setError })
      ),
      el(
        Section,
        {
          key: 'at',
          name: 'account-ttl',
          title: t('chat.security.selfDestruct'),
        },
        el(AccountTtl, secProps)
      ),
      // Delete my account: Telegram's own page opens in a new tab (R-Y212).
      el(
        Section,
        {
          key: 'da',
          name: 'delete-account',
          title: t('chat.deleteAccount.title'),
        },
        el(DeleteAccountRow)
      ),
      sec.state.data?.content?.canChange
        ? el(
            Section,
            {
              key: 'sc',
              name: 'sensitive',
              title: t('chat.security.sensitiveTitle'),
            },
            el(SensitiveContent, secProps)
          )
        : null,
      // Cloud drafts: Clear all drafts, after a confirmation (R-Y207).
      el(
        Section,
        { key: 'dr', name: 'drafts', title: t('chat.drafts.title') },
        el(ClearDrafts, { api })
      ),
      el(
        Section,
        { key: 'ar', name: 'archive', title: t('chat.archive.settingsTitle') },
        el(SwitchGroup, { t, archive, names: ARCHIVE_SWITCHES })
      ),
      el(
        Section,
        { key: 'a', name: 'auto-delete', title: t('chat.privacy.autoDelete') },
        el(AutoDelete, props)
      ),
      el(
        Section,
        {
          key: 'cf',
          name: 'close-friends',
          title: t('chat.contactsEdit.closeFriends'),
        },
        el(CloseFriends, { ...props, setOpen: setFriends })
      ),
      el(
        Section,
        { key: 's', name: 'sessions', title: t('chat.privacy.sessions') },
        el(Sessions, props)
      ),
      el(
        Section,
        { key: 'w', name: 'web-sessions', title: t('chat.web.title') },
        el(WebSessions, props)
      ),
      el(
        Section,
        { key: 'b', name: 'blocked', title: t('chat.privacy.blocked') },
        el(Blocked, props)
      ),
    ]
  );
};

// The editor is a sibling of the form, never inside it (a form in a form
// would submit the outer one); while it is open Escape closes only it.
export const PrivacyDialog = ({ api, close }) => {
  const [friends, setFriends] = useState(false);
  return el(React.Fragment, null, [
    el(PrivacyForm, { key: 'p', api, close, friends, setFriends }),
    friends
      ? el(CloseFriendsDialog, {
          key: 'cf',
          api,
          close: () => setFriends(false),
        })
      : null,
  ]);
};
