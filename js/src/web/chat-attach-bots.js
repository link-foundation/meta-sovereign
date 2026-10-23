// Attachment-menu bots (R-Y201), as Telegram Desktop has them (learned,
// never copied): the paperclip's menu lists the bots the person added
// (messages.getAttachMenuBots) that suit the open chat (each bot's
// `peer_types`); choosing one opens its mini app from the chat, as a
// mini app of R-Y168 opens (messages.requestWebView). A right click on a
// bot in the menu offers "Remove from menu". A bot is added from its
// profile or from a link with `startattach`: a box asks first, with the
// terms of mini apps to agree to and, when the bot asks, to allow it to
// send messages (messages.toggleBotInAttachMenu). Nothing is added or
// removed without a press. (Not done: an install request a bot's app
// itself makes.)

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { openWebApp } from './chat-web-apps.js';

const el = React.createElement;

const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const START = /^[A-Za-z0-9_-]{0,512}$/;
const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;

/**
 * What a link with `startattach` names: `{ username, startParam }`; null
 * for anything else (t.me/bot?startattach=x, tg://resolve?domain=bot&
 * startattach=x).
 */
export const parseAttachLink = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  const query = url.searchParams;
  let username = null;
  if (url.protocol === 'tg:' && url.hostname === 'resolve') {
    username = query.get('domain');
  } else if (
    url.protocol === 'https:' &&
    HOSTS.test(url.hostname) &&
    !url.username &&
    !url.password
  ) {
    const parts = url.pathname.split('/').filter(Boolean);
    username = parts.length === 1 ? parts[0] : null;
  }
  const param = query.get('startattach') ?? '';
  return NAME.test(username ?? '') &&
    query.has('startattach') &&
    START.test(param)
    ? { username, startParam: param }
    : null;
};

/**
 * The kind of chat as a bot's `peer_types` say it: a one-to-one chat
 * with the bot itself, with another bot, with a person, a group or a
 * channel.
 */
export const peerTypeOf = (state, botId) => {
  const current = state.current;
  if (!current) {
    return null;
  }
  if (current.personal) {
    if (state.info?.bot) {
      return String(current.chat) === String(botId) ? 'sameBotPm' : 'botPm';
    }
    return 'pm';
  }
  return current.kind === 'channel' || state.info?.kind === 'channel'
    ? 'broadcast'
    : 'chat';
};

/** The bots of `list` that the open chat may use, as they are listed. */
export const botsFor = (list, state) =>
  (list ?? []).filter(
    (bot) =>
      !bot.inactive && (bot.peerTypes ?? []).includes(peerTypeOf(state, bot.id))
  );

const EVENT = 'ms-attach-bot';

/**
 * Asks the chat screen to offer a bot for the attachment menu (a link's
 * `{ username, startParam }` or a profile's `{ bot }`); true when it took
 * the request.
 */
export const openAttachBot = (request) => {
  if (!globalThis.dispatchEvent) {
    return false;
  }
  const detail = { request, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

/** For a link click: true when `href` names an attachment-menu bot. */
export const openAttachLink = (href) => {
  const link = parseAttachLink(href);
  return link ? openAttachBot(link) : false;
};

const Check = ({ name, checked, onChange, children }) =>
  el('label', { className: 'bot-login-check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-field': name,
      checked,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 't' }, children),
  ]);

// "Add to attachment menu": the terms to agree to, and the write choice.
const AddDialog = ({ bot, onAdd, onClose }) => {
  const t = useT();
  const [terms, setTerms] = useState(false);
  const [write, setWrite] = useState(true);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  const name = bot.name || bot.shortName;
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.attachBot.title'),
    },
    el(
      'div',
      { className: 'delete-dialog bot-dialog', 'data-bot-dialog': 'attach' },
      [
        el('h3', { key: 'h' }, t('chat.attachBot.title')),
        el('p', { key: 'q', className: 'bot-dialog-text' }, [
          t('chat.attachBot.ask', { bot: name }),
        ]),
        el(
          Check,
          { key: 'terms', name: 'terms', checked: terms, onChange: setTerms },
          t('chat.attachBot.terms')
        ),
        bot.requestWriteAccess
          ? el(
              Check,
              { key: 'w', name: 'write', checked: write, onChange: setWrite },
              t('chat.login.write', { bot: name })
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
              'data-action': 'attach-bot-add',
              disabled: !terms,
              onClick: () => onAdd(bot.requestWriteAccess && write),
            },
            t('chat.attachBot.add')
          ),
        ]),
      ]
    )
  );
};

// The Remove entry that a right click on a menu bot shows.
export const RemoveMenu = ({ at, onRemove, onClose }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => e.target.closest?.('.attach-bot-menu') || onClose();
    globalThis.addEventListener?.('keydown', onKey);
    globalThis.addEventListener?.('pointerdown', onDown);
    return () => {
      globalThis.removeEventListener?.('keydown', onKey);
      globalThis.removeEventListener?.('pointerdown', onDown);
    };
  }, []);
  const menu = el(
    'ul',
    {
      className: 'msg-context-menu attach-bot-menu',
      role: 'menu',
      style: { left: at.x, top: at.y },
    },
    el(
      'li',
      null,
      el(
        'button',
        {
          type: 'button',
          className: 'attach-menu-item',
          'data-action': 'attach-bot-remove',
          onClick: onRemove,
        },
        t('chat.attachBot.remove')
      )
    )
  );
  const body = globalThis.document?.body;
  return body ? createPortal(menu, body) : menu;
};

/**
 * The attachment-menu bots of the chat screen: `{ menu, dialog }`.
 * `menu` is for the paperclip (`bots`, `load()` when it opens,
 * `onBot(bot)`, `onRemove(bot)`); `dialog` holds the add box.
 */
export const useAttachBots = ({ state, api }) => {
  const [list, setList] = useState([]);
  const [prompt, setPrompt] = useState(null);
  const enabled = typeof api?.telegramAttachMenuBots === 'function';
  const fail = () => state.notify?.({ kind: 'action-failed' });
  const chat = state.current?.chat;
  const load = async () => {
    const answer = await Promise.resolve(api.telegramAttachMenuBots()).catch(
      () => null
    );
    if (answer?.ok) {
      setList(answer.bots ?? []);
    }
    return answer;
  };
  const onBot = (bot, startParam) =>
    chat &&
    (openWebApp({
      kind: 'attach',
      chat,
      bot: bot.id,
      name: bot.name || bot.shortName,
      ...(startParam ? { startParam } : {}),
    }) ||
      fail());
  const offer = async (request) => {
    const answer = await Promise.resolve(
      api?.telegramAttachMenuBot?.(
        request.username ? { username: request.username } : { bot: request.bot }
      )
    ).catch(() => null);
    if (!answer?.ok) {
      return fail();
    }
    return answer.bot.inactive
      ? setPrompt({ bot: answer.bot, startParam: request.startParam })
      : onBot(answer.bot, request.startParam);
  };
  const add = async (writeAllowed) => {
    const { bot, startParam } = prompt;
    setPrompt(null);
    const answer = await Promise.resolve(
      api.telegramAttachMenuToggle({
        bot: bot.id,
        enabled: true,
        ...(writeAllowed ? { writeAllowed: true } : {}),
      })
    ).catch(() => null);
    if (!answer?.ok) {
      return fail();
    }
    await load();
    return startParam === undefined ? undefined : onBot(bot, startParam);
  };
  const remove = async (bot) => {
    const answer = await Promise.resolve(
      api.telegramAttachMenuToggle({ bot: bot.id, enabled: false })
    ).catch(() => null);
    return answer?.ok ? load() : fail();
  };
  const latest = useRef(offer);
  latest.current = offer;
  useEffect(() => {
    const on = (event) => {
      event.detail.handled = true;
      latest.current(event.detail.request);
    };
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return {
    menu: enabled
      ? { bots: botsFor(list, state), load, onBot, onRemove: remove }
      : null,
    dialog: prompt
      ? el(AddDialog, {
          key: 'attach-bot',
          bot: prompt.bot,
          onAdd: add,
          onClose: () => setPrompt(null),
        })
      : null,
  };
};

/**
 * The profile's "Add to attachment menu" row for a bot that offers one
 * and is not in the menu yet: asked once when the profile opens (read
 * only); the press opens the box.
 */
export const BotAttachRow = ({ api, chat, info }) => {
  const t = useT();
  const [bot, setBot] = useState(null);
  const id = String(chat?.chat ?? '');
  const on =
    info?.bot === true &&
    /^\d{1,20}$/.test(id) &&
    typeof api?.telegramAttachMenuBot === 'function';
  useEffect(() => {
    setBot(null);
    if (!on) {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramAttachMenuBot({ bot: id }))
      .then((a) => live && a?.ok && a.bot?.inactive && setBot(a.bot))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, id, on]);
  if (!bot) {
    return null;
  }
  return el(
    'section',
    { className: 'person-section' },
    el(
      'button',
      {
        type: 'button',
        className: 'attach-bot-add',
        'data-action': 'profile-attach-bot',
        onClick: () => openAttachBot({ bot: id }),
      },
      t('chat.attachBot.add')
    )
  );
};
