// Links to a person, opened inside the app (R-Y217; learned, never copied):
// t.me/contact/<token> and tg://contact?token= (a shared contact, resolved
// with contacts.importContactToken), and t.me/+<digits> and
// tg://resolve?phone= (a phone number, contacts.resolvePhone). The person's
// chat opens with their profile column; a number nobody has on Telegram
// is told in words. `contactLinkOf` is pure; a click asks the host
// (mounted once in the app) to open it.

import React, { useEffect, useState } from 'react';
import { useEsc } from './chat-invite.js';
import { useT } from './i18n.js';
import { openChat } from './chat-state.js';

const el = React.createElement;

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const PHONE = /^\d{5,15}$/;

const fromScheme = (url) => {
  const query = url.searchParams;
  if (url.hostname === 'contact') {
    return { token: query.get('token') };
  }
  return url.hostname === 'resolve' && query.get('phone')
    ? { phone: query.get('phone').replace(/^\+/, '') }
    : null;
};

const fromPath = (segments) => {
  const [head, name, ...more] = segments;
  if (head === 'contact' && name && more.length === 0) {
    return { token: name };
  }
  return head?.startsWith('+') && !name ? { phone: head.slice(1) } : null;
};

/**
 * What a link to a person names: `{ token }` of a shared contact,
 * `{ phone }` (digits) of a number, or null for anything else.
 */
export const contactLinkOf = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  let found = null;
  if (url.protocol === 'tg:') {
    found = fromScheme(url);
  } else if (
    ['http:', 'https:'].includes(url.protocol) &&
    HOSTS.test(url.hostname) &&
    !url.username &&
    !url.password
  ) {
    found = fromPath(url.pathname.split('/').filter(Boolean));
  }
  if (found?.token !== undefined) {
    return TOKEN.test(found.token ?? '') ? { token: found.token } : null;
  }
  return found && PHONE.test(found.phone ?? '') ? { phone: found.phone } : null;
};

const EVENT = 'ms-contact-link';

/** Asks the host to open the person a link names; true when it is one. */
export const openContactLink = (href) => {
  const link = contactLinkOf(href);
  if (!link || !globalThis.dispatchEvent) {
    return false;
  }
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail: { link } }));
  return true;
};

const PROFILE = 'ms-contact-profile';
let wanted = null;

/** The person's chat opens, and its profile column with it. */
export const openProfileOf = (chat) => {
  wanted = String(chat);
  openChat({ source: 'telegram', chat: wanted });
  globalThis.dispatchEvent?.(new CustomEvent(PROFILE));
};

/**
 * In the chat screen: opens the profile column once the chat a link named
 * is the open one (`open()` shows it).
 */
export const useProfileRequest = (current, open) => {
  const chat = current?.chat === undefined ? null : String(current.chat);
  useEffect(() => {
    const check = () => {
      if (wanted !== null && wanted === chat) {
        wanted = null;
        open();
      }
    };
    check();
    globalThis.addEventListener?.(PROFILE, check);
    return () => globalThis.removeEventListener?.(PROFILE, check);
  }, [chat]);
};

const resolve = (api, link) =>
  link.token
    ? api.telegramContactTokenOpen({ token: link.token })
    : api.telegramPhoneResolve({ phone: link.phone });

const Notice = ({ text, close }) => {
  const t = useT();
  useEsc(close);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': text,
      'data-dialog': 'contact-link',
      onClick: (e) => e.target === e.currentTarget && close(),
    },
    el('div', { className: 'delete-dialog' }, [
      el(
        'p',
        { key: 'p', role: 'status', 'data-contact-link': 'notice' },
        text
      ),
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'x', type: 'button', 'data-action': 'cancel', onClick: close },
          t('chat.contactLink.ok')
        ),
      ]),
    ])
  );
};

const noticeKey = (answer) => {
  if (answer?.ok && answer.found === false) {
    return 'chat.contactLink.notFound';
  }
  return answer?.code === 'token-invalid'
    ? 'chat.contactLink.tokenInvalid'
    : 'chat.contactLink.failed';
};

/** Mounted once in the app: opens the people the links name. */
export const ContactLinkHost = ({ api }) => {
  const t = useT();
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const on = (event) => {
      Promise.resolve(resolve(api, event.detail.link))
        .then((answer) =>
          answer?.ok && answer.chat
            ? openProfileOf(answer.chat)
            : setNotice(noticeKey(answer))
        )
        .catch(() => setNotice('chat.contactLink.failed'));
    };
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, [api]);
  return notice
    ? el(Notice, { text: t(notice), close: () => setNotice(null) })
    : null;
};
