// Chat invite links, as Telegram Desktop shows them (R-Y123; learned, never
// copied):
// - a link in a message (t.me/+HASH, t.me/joinchat/HASH, tg://join?invite=)
//   opens a small dialog instead of the browser: the chat's initial, title,
//   what it is (a channel or a group), its members, and Join (Request to
//   join when the admins must accept) or Cancel. A chat the user is
//   already in is opened instead. Nothing is joined until Join is pressed.
// - the chat's own primary link in its info column, for those who may
//   invite: with Copy, and "Revoke link" (asked in the page, never by the
//   browser) which makes a new primary link.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

const HASH = '[A-Za-z0-9_-]{8,64}';
const PATTERNS = [
  new RegExp(
    `^https?://(?:www\\.)?(?:t\\.me|telegram\\.me|telegram\\.dog)/\\+(${HASH})/?$`,
    'i'
  ),
  new RegExp(
    `^https?://(?:www\\.)?(?:t\\.me|telegram\\.me|telegram\\.dog)/joinchat/(${HASH})/?$`,
    'i'
  ),
  new RegExp(`^tg://join\\?invite=(${HASH})$`, 'i'),
];

/** The invite hash a link carries, or null when it is not an invite. */
export const inviteHashOf = (href) => {
  const value = String(href ?? '').trim();
  for (const pattern of PATTERNS) {
    const found = pattern.exec(value);
    if (found) {
      return found[1];
    }
  }
  return null;
};

// Opens a chat by its address, as the chat list's links do (the hash).
const openChat = ({ source, chat }) => {
  if (globalThis.location) {
    globalThis.location.hash = `chat=${source}:${encodeURIComponent(chat)}`;
  }
};

const EVENT = 'ms-invite-open';

/** Asks the dialog (mounted once, in the app) to open for `hash`. */
export const openInvite = (hash) =>
  globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: { hash } }));

const useEsc = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
};

const errorText = (t, code) => {
  const key = `chat.invite.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.invite.err.failed') : text;
};

const Preview = ({ invite, t }) => {
  const members = invite.broadcast
    ? t('chat.info.subscribers', { count: invite.members })
    : t('chat.info.members', { count: invite.members });
  return el('div', { className: 'invite-preview' }, [
    el(
      'span',
      { key: 'a', className: 'invite-initial', 'aria-hidden': 'true' },
      Array.from(invite.title)[0]?.toUpperCase() ?? '?'
    ),
    el('strong', { key: 't', className: 'invite-title' }, invite.title),
    el(
      'span',
      { key: 'm', className: 'meta invite-meta' },
      `${t(invite.broadcast ? 'chat.invite.channel' : 'chat.invite.group')}, ${members}`
    ),
    invite.about
      ? el('p', { key: 'b', className: 'invite-about' }, invite.about)
      : null,
  ]);
};

// What the link leads to, asked once; an own chat is opened at once.
const useInvite = (api, hash, close) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let active = true;
    api
      .telegramInviteCheck({ hash })
      .then((answer) => {
        if (!active) {
          return;
        }
        if (answer?.ok && answer.already) {
          openChat({ source: 'telegram', chat: answer.chat });
          close();
        } else if (answer?.ok) {
          setState({ phase: 'ready', invite: answer.invite });
        } else {
          setState({ phase: 'error', code: answer?.code ?? 'failed' });
        }
      })
      .catch(() => active && setState({ phase: 'error', code: 'failed' }));
    return () => {
      active = false;
    };
  }, [api, hash]);
  return [state, setState];
};

const InviteDialog = ({ api, hash, close }) => {
  const t = useT();
  const [state, setState] = useInvite(api, hash, close);
  const [busy, setBusy] = useState(false);
  useEsc(close);
  const join = async () => {
    setBusy(true);
    const answer = await api
      .telegramInviteJoin({ hash })
      .catch(() => ({ ok: false, code: 'failed' }));
    setBusy(false);
    if (answer?.ok) {
      if (answer.chat) {
        openChat({ source: 'telegram', chat: answer.chat });
      }
      close();
    } else {
      setState({ phase: 'error', code: answer?.code ?? 'failed' });
    }
  };
  const { phase, invite } = state;
  let body;
  if (phase === 'ready') {
    body = el(Preview, { invite, t });
  } else if (phase === 'error') {
    const sent = state.code === 'invite-request-sent';
    body = el(
      'p',
      {
        className: 'invite-error',
        role: 'alert',
        'data-invite-error': state.code,
      },
      sent ? t('chat.invite.requestSent') : errorText(t, state.code)
    );
  } else {
    body = el('p', { className: 'meta' }, t('chat.invite.loading'));
  }
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.invite.link'),
      'data-dialog': 'invite',
    },
    el('div', { className: 'delete-dialog invite-dialog' }, [
      body,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'c', type: 'button', 'data-action': 'cancel', onClick: close },
          t('chat.invite.cancel')
        ),
        phase === 'ready'
          ? el(
              'button',
              {
                key: 'j',
                type: 'button',
                className: 'primary',
                'data-action': 'join',
                disabled: busy,
                onClick: join,
              },
              invite.requestNeeded
                ? t('chat.invite.request')
                : t('chat.invite.join')
            )
          : null,
      ]),
    ])
  );
};

/** Mounted once: opens the invite dialog when a link asks for it. */
export const InviteHost = ({ api }) => {
  const [hash, setHash] = useState(null);
  useEffect(() => {
    const on = (event) => setHash(event.detail?.hash ?? null);
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return hash && typeof api?.telegramInviteCheck === 'function'
    ? el(InviteDialog, { key: hash, api, hash, close: () => setHash(null) })
    : null;
};

const RevokeDialog = ({ t, busy, error, onYes, onNo }) => {
  useEsc(onNo);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.invite.revokeTitle'),
      'data-dialog': 'invite-revoke',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.invite.revokeTitle')),
      el('p', { key: 'p' }, t('chat.invite.revokeBody')),
      error ? el('p', { key: 'e', role: 'alert' }, errorText(t, error)) : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'n', type: 'button', 'data-action': 'cancel', onClick: onNo },
          t('chat.invite.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'revoke-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.invite.revokeConfirm')
        ),
      ]),
    ])
  );
};

/** Whether the info column shows the chat's invite link. */
export const hasInviteLink = (info) =>
  Boolean(info?.canInvite && info.inviteLink);

const InviteLinkBody = ({ api, chat, info }) => {
  const t = useT();
  const [link, setLink] = useState(info.inviteLink);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const copy = () =>
    Promise.resolve(globalThis.navigator?.clipboard?.writeText(link))
      .then(() => setCopied(true))
      .catch(() => {});
  useEffect(() => {
    if (copied) {
      const timer = globalThis.setTimeout(() => setCopied(false), 2000);
      return () => globalThis.clearTimeout(timer);
    }
    return undefined;
  }, [copied]);
  const revoke = async () => {
    setBusy(true);
    const answer = await api
      .telegramInviteRevoke({ chat: String(chat.chat) })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok && answer.link) {
      setLink(answer.link);
      setError(null);
      setAsking(false);
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  return el('div', { className: 'invite-link', 'data-invite-link': '' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.invite.link')),
    el('code', { key: 'c', className: 'invite-link-text' }, link),
    el('div', { key: 'b', className: 'invite-link-btns' }, [
      el(
        'button',
        { key: 'cp', type: 'button', 'data-action': 'copy', onClick: copy },
        [
          el(Icon, { key: 'i', name: 'copy', size: 16 }),
          ` ${copied ? t('chat.invite.copied') : t('chat.invite.copy')}`,
        ]
      ),
      el(
        'button',
        {
          key: 'rv',
          type: 'button',
          'data-action': 'revoke',
          onClick: () => setAsking(true),
        },
        t('chat.invite.revoke')
      ),
    ]),
    asking
      ? el(RevokeDialog, {
          key: 'd',
          t,
          busy,
          error,
          onYes: revoke,
          onNo: () => {
            setAsking(false);
            setError(null);
          },
        })
      : null,
  ]);
};

/** The chat's primary invite link, Copy and Revoke, or nothing. */
export const InviteLink = ({ api, chat, info }) =>
  hasInviteLink(info) && typeof api?.telegramInviteRevoke === 'function'
    ? el(InviteLinkBody, { key: String(chat.chat), api, chat, info })
    : null;
