// Bot login links (R-Y201), as Telegram Desktop handles them (learned,
// never copied): a bot's login button (KeyboardButtonUrlAuth) or a link
// whose domain Telegram's app config lists (`url_auth_domains`) first asks
// Telegram what pressing it does (messages.requestUrlAuth). Either the
// link just opens, or the person is asked in a box: "Open this link?"
// with the domain, "Log in to <domain> as <name>" and — when the bot
// asks — "Allow <bot> to send me messages". Open accepts the login
// (messages.acceptUrlAuth) and opens the address Telegram answers, or
// the link as it was when the login box is unticked; Cancel does nothing.
// Nothing is asked of Telegram until the person presses the button or
// the link; the app config is read only to know which domains ask.
//
// Opening goes through the one safe path (`openExternal`): http(s)
// addresses only, in a new tab without opener or referrer.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

const WEB = /^https?:\/\//i;

/** Opens a web address in a new tab, safely; false for anything else. */
export const openExternal = (url) => {
  const value = String(url ?? '').trim();
  if (!WEB.test(value)) {
    return false;
  }
  globalThis.open?.(value, '_blank', 'noopener,noreferrer');
  return true;
};

// The login domains of this session (lower case), read once.
let domains = new Set();

/** Sets the login domains (the hook reads them; the tests' too). */
export const setLoginDomains = (list) => {
  domains = new Set((list ?? []).map((d) => String(d).toLowerCase()));
};

/** Whether `href` is an https link on a login domain (or under one). */
export const isLoginLink = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return [...domains].some((d) => host === d || host.endsWith(`.${d}`));
};

const EVENT = 'ms-login-link';

/**
 * Asks the chat screen to handle a click on a link of a login domain;
 * true when it took it (the caller then stops the browser following it).
 */
export const openLoginLink = (href) => {
  if (!isLoginLink(href) || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { href, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

/** What the request for a button or a link asks, as the server takes. */
export const requestBody = (source) =>
  source.url !== undefined
    ? { url: source.url }
    : {
        chat: source.chat,
        id: source.id,
        buttonId: source.buttonId,
        ...(source.original ? { original: source.original } : {}),
      };

/** The write-access flag the Open press sends. */
export const writeAllowedOf = ({ login, write, requestWriteAccess }) =>
  Boolean(login && write && requestWriteAccess);

const Check = ({ name, checked, disabled, onChange, children }) =>
  el('label', { className: 'bot-login-check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-field': name,
      checked,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 't' }, children),
  ]);

// The box: the domain, the login choice and, when asked, the write one.
const LoginDialog = ({ ask, selfName, onOpen, onClose }) => {
  const t = useT();
  const { answer } = ask;
  const [login, setLogin] = useState(true);
  const [write, setWrite] = useState(true);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  const botName = answer.bot?.name || answer.bot?.username || '';
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.bot.openTitle'),
    },
    el(
      'div',
      { className: 'delete-dialog bot-dialog', 'data-bot-dialog': 'login' },
      [
        el('h3', { key: 'h' }, t('chat.bot.openTitle')),
        el(
          'p',
          { key: 'd', className: 'bot-dialog-url', 'data-login-domain': '' },
          answer.domain
        ),
        el(
          Check,
          { key: 'l', name: 'login', checked: login, onChange: setLogin },
          t('chat.login.as', {
            domain: answer.domain,
            name: selfName || t('chat.login.you'),
          })
        ),
        answer.requestWriteAccess
          ? el(
              Check,
              {
                key: 'w',
                name: 'write',
                checked: login && write,
                disabled: !login,
                onChange: setWrite,
              },
              t('chat.login.write', { bot: botName })
            )
          : null,
        el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
          el(
            'button',
            { key: 'cancel', type: 'button', onClick: onClose },
            t('common.cancel')
          ),
          el(
            'button',
            {
              key: 'ok',
              type: 'button',
              className: 'primary',
              'data-action': 'login-open',
              autoFocus: true,
              onClick: () =>
                onOpen({
                  login,
                  writeAllowed: writeAllowedOf({
                    login,
                    write,
                    requestWriteAccess: answer.requestWriteAccess,
                  }),
                }),
            },
            t('chat.bot.open')
          ),
        ]),
      ]
    )
  );
};

/**
 * The login flow of the chat screen: `{ start(source), dialog }`, and it
 * listens for clicks on login-domain links. `source` is a login button
 * `{ chat, id, buttonId, original }` or a link `{ url }`.
 */
export const useBotLogin = ({ api, state }) => {
  const [ask, setAsk] = useState(null);
  const fail = () => state?.notify?.({ kind: 'action-failed' });
  const start = async (source) => {
    const answer = await Promise.resolve(
      api?.telegramBotUrlAuth?.(requestBody(source))
    ).catch(() => null);
    if (!answer?.ok) {
      return fail();
    }
    if (answer.status === 'request') {
      return setAsk({ source, answer });
    }
    return openExternal(answer.url) || fail();
  };
  const open = async ({ login, writeAllowed }) => {
    const { source } = ask;
    setAsk(null);
    const original = source.url ?? source.original;
    if (!login) {
      // Unticked: the link as it was, without the login.
      return openExternal(original) || fail();
    }
    const answer = await Promise.resolve(
      api?.telegramBotUrlAccept?.({ ...requestBody(source), writeAllowed })
    ).catch(() => null);
    return answer?.ok && openExternal(answer.url) ? undefined : fail();
  };
  // The login domains, read once from Telegram's app config.
  useEffect(() => {
    let live = true;
    Promise.resolve(api?.telegramUrlAuthDomains?.())
      .then((a) => live && a?.ok && setLoginDomains(a.domains))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  const latest = useRef(start);
  latest.current = start;
  useEffect(() => {
    const on = (event) => {
      event.detail.handled = true;
      latest.current({ url: event.detail.href });
    };
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  const account = state?.telegram?.account;
  const selfName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || null;
  return {
    start,
    dialog: ask
      ? el(LoginDialog, {
          key: 'login',
          ask,
          selfName,
          onOpen: open,
          onClose: () => setAsk(null),
        })
      : null,
  };
};
