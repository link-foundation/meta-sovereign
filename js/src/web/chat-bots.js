// A bot's buttons (R-Y110), as Telegram's apps have them (learned,
// never copied): rows of buttons under a bot's message — one asks the
// bot (its answer a toast, a box, or a link to open), opens a link after
// asking, copies words, opens a profile, puts "@bot query" in the box —
// and a keyboard under the message box whose buttons send their words,
// shown until the bot takes it away, hidden and shown again with a
// button beside the box; a bot asking for an answer makes the box
// answer it, with the words the bot asked the box to show.

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { networkMessageId } from './chat-model.js';
import { botAskOf, inlineKeyboardOf, replyKeyboardOf } from './bot-keyboard.js';
import { appUrl } from './web-apps-model.js';
import { openWebApp } from './chat-web-apps.js';
import { gameUrl } from './chat-games.js';

const el = React.createElement;

// A bot's toast shows this long, as Telegram's does.
const TOAST_MS = 3500;

// Only these links are opened: a bot's `javascript:` or `file:` is not.
const OPENABLE = /^https?:\/\//i;

/** A `tg://`, `t.me` or web link a bot gave, as a web link; null else. */
export const openableUrl = (url) => {
  const value = String(url ?? '').trim();
  if (OPENABLE.test(value)) {
    return value;
  }
  // Telegram's own links open on the web as t.me ones.
  const resolve = /^tg:\/\/resolve\?domain=([A-Za-z0-9_]{3,64})(.*)$/i.exec(
    value
  );
  return resolve ? `https://t.me/${resolve[1]}` : null;
};

const toastOf = (state, notice) => {
  state.notify?.(notice);
  globalThis.setTimeout(
    () => state.notify?.((now) => (now === notice ? null : now)),
    TOAST_MS
  );
};

// The corner mark a button carries, as Telegram's apps draw: a link
// leaves the app, a switch goes to another chat, a copy copies.
const MARKS = { url: 'link', switch: 'forward', copy: 'copy', app: 'link' };

/** The rows of buttons under a bot's message. */
export const InlineKeyboard = ({ message, onAction }) => {
  const rows = inlineKeyboardOf(message);
  const [busy, setBusy] = useState(null);
  if (!rows || typeof onAction !== 'function') {
    return null;
  }
  const press = (key, button) => {
    setBusy(key);
    Promise.resolve(onAction('bot', message, button)).finally(() =>
      setBusy((now) => (now === key ? null : now))
    );
  };
  return el(
    'div',
    { className: 'bot-keyboard', 'data-bot-keyboard': message.id },
    rows.map((row, r) =>
      el(
        'div',
        { key: r, className: 'bot-row' },
        row.map((button, c) => {
          const key = `${r}:${c}`;
          return el(BotButton, {
            key,
            button,
            busy: busy === key,
            onPress: () => press(key, button),
          });
        })
      )
    )
  );
};

const BotButton = ({ button, busy, onPress }) => {
  const mark = MARKS[button.kind];
  return el(
    'button',
    {
      type: 'button',
      className: button.tone ? `bot-button is-${button.tone}` : 'bot-button',
      'data-bot-button': button.kind,
      'aria-busy': busy ? 'true' : undefined,
      title: button.url ?? undefined,
      onClick: (event) => {
        event.stopPropagation();
        if (!busy) {
          onPress();
        }
      },
      onDoubleClick: (event) => event.stopPropagation(),
    },
    [
      el('span', { key: 't', className: 'bot-button-text' }, button.text),
      mark
        ? el(
            'span',
            { key: 'm', className: 'bot-button-mark', 'aria-hidden': 'true' },
            el(Icon, { name: mark, size: 11 })
          )
        : null,
    ]
  );
};

// Opening a link, or the bot's words in a box.
const BotDialog = ({ ask, onClose }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  const link = ask.kind === 'url';
  const open = () => {
    onClose();
    globalThis.open?.(ask.url, '_blank', 'noopener,noreferrer');
  };
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': link ? t('chat.bot.openTitle') : t('chat.bot.answer'),
    },
    el(
      'div',
      { className: 'delete-dialog bot-dialog', 'data-bot-dialog': ask.kind },
      [
        link ? el('h3', { key: 'h' }, t('chat.bot.openTitle')) : null,
        el(
          'p',
          { key: 'q', className: link ? 'bot-dialog-url' : 'bot-dialog-text' },
          link ? ask.url : ask.text
        ),
        el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
          link
            ? el(
                'button',
                { key: 'cancel', type: 'button', onClick: onClose },
                t('common.cancel')
              )
            : null,
          el(
            'button',
            {
              key: 'ok',
              type: 'button',
              className: 'primary',
              'data-action': link ? 'bot-open' : 'bot-ok',
              autoFocus: true,
              onClick: link ? open : onClose,
            },
            link ? t('chat.bot.open') : t('chat.bot.ok')
          ),
        ]),
      ]
    )
  );
};

// What the bot answered a press: a link to open, words in a box or a
// toast, or nothing.
const answered = (answer, { setAsk, state, game = false }) => {
  if (!answer || answer.error || answer.ok === false) {
    toastOf(state, { kind: 'action-failed' });
    return;
  }
  // A game's address is a web link and nothing else (R-Y190).
  const url = answer.url ? (game ? gameUrl : openableUrl)(answer.url) : null;
  if (url) {
    setAsk({ kind: 'url', url });
  } else if (answer.message && answer.alert) {
    setAsk({ kind: 'alert', text: answer.message });
  } else if (answer.message) {
    toastOf(state, { kind: 'bot', name: answer.message });
  }
};

/**
 * What a press on a bot's button under its message does:
 * `{ press(message, button), dialog }`; `copy(text)` copies with the
 * app's toast.
 */
export const useBotPress = ({ state, api, copy }) => {
  const [ask, setAsk] = useState(null);
  const unsupported = () => toastOf(state, { kind: 'bot-unsupported' });
  const callback = async (message, button, extra = {}) => {
    if (button.password || typeof api.telegramBotCallback !== 'function') {
      return unsupported();
    }
    const answer = await api.telegramBotCallback({
      chat: state.current?.chat,
      id: networkMessageId(message),
      ...(button.data ? { data: button.data } : {}),
      ...extra,
    });
    return answered(answer, { setAsk, state, game: extra.game === true });
  };
  const username = state.current?.personal ? state.info?.username : null;
  const KIND = {
    callback: (message, button) => callback(message, button),
    game: (message, button) => callback(message, button, { game: true }),
    url: (_m, button) => {
      const url = openableUrl(button.url);
      return url ? setAsk({ kind: 'url', url }) : unsupported();
    },
    copy: (_m, button) => copy(button.copy),
    app: (message, button) =>
      openButtonApp(state, message, button) || unsupported(),
    profile: (_m, button) =>
      button.user
        ? state.openAt?.({
            source: 'telegram',
            chat: button.user,
            kind: 'user',
          })
        : unsupported(),
    switch: (_m, button) =>
      username
        ? state.composer?.setText(`${`@${username} ${button.query}`.trim()} `)
        : unsupported(),
    text: (message, button) => say(state, message, button.text),
  };
  return {
    press: (message, button) =>
      (KIND[button?.kind] ?? unsupported)(message, button),
    dialog: ask
      ? el(BotDialog, { key: 'bot', ask, onClose: () => setAsk(null) })
      : null,
  };
};

// The bot a button's message speaks for: the chat's, or who sent it (a
// message sent through an inline bot, that bot).
const botOfMessage = (state, message) => {
  const via = message?.raw?.viaBotId;
  const id = via?.value ?? via ?? message?.sender;
  return state.current?.personal ? state.current.chat : String(id ?? '');
};

/**
 * A web-app button's mini app (R-Y168): opened from the open chat for the
 * message's bot; false when it cannot be (no https address, no bot).
 */
export const openButtonApp = (state, message, button) => {
  const url = appUrl(button.url);
  const bot = botOfMessage(state, message);
  if (!url || !/^\d{1,20}$/.test(bot) || !state.current?.chat) {
    return false;
  }
  return openWebApp({
    kind: button.simple ? 'simple' : 'inline',
    chat: state.current.chat,
    bot,
    url,
    buttonText: button.text,
    name: state.info?.title ?? state.current.name ?? '',
  });
};

// A keyboard button's words, sent; in a group, as an answer to the bot.
const say = (state, message, words) =>
  state.composer?.say?.(words, {
    replyTo: state.current?.personal ? null : networkMessageId(message),
  });

/**
 * The keyboard a bot put under the open chat's message box:
 * `{ keyboard, shown, toggle, press(button), placeholder }`; a bot asking
 * for an answer sets the box's reply with `replyRefOf(message)`.
 */
export const useReplyKeyboard = ({ state, replyRefOf }) => {
  const { messages, current, composer } = state;
  const options = useMemo(
    () => ({
      personal: Boolean(current?.personal),
      mine: (ref) =>
        Boolean(ref) &&
        (messages ?? []).some(
          (m) => m.id === `msg:${current?.source}:${ref}` && m.sender === 'me'
        ),
    }),
    [messages, current?.key]
  );
  const keyboard = useMemo(
    () => replyKeyboardOf(messages, options),
    [messages, options]
  );
  const ask = useMemo(() => botAskOf(messages, options), [messages, options]);
  // Keyboards hidden here (by the button, or used once): their message ids.
  const [hidden, setHidden] = useState(() => new Set());
  const id = keyboard?.message.id ?? null;
  const hide = (on) =>
    setHidden((now) => {
      const next = new Set(now);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  // The bot asked for an answer: the box answers it, once.
  const [answering, setAnswering] = useState(null);
  const askId = ask.reply?.id ?? null;
  useEffect(() => {
    if (askId && askId !== answering && replyRefOf) {
      setAnswering(askId);
      composer?.setReplyTo?.(replyRefOf(ask.reply));
    }
  }, [askId]);
  const shown = Boolean(keyboard) && !hidden.has(id);
  return {
    keyboard,
    shown,
    toggle: () => hide(shown),
    placeholder: ask.placeholder,
    press: (button) => {
      if (button.kind === 'app') {
        if (!openButtonApp(state, keyboard.message, button)) {
          toastOf(state, { kind: 'bot-unsupported' });
        }
        return;
      }
      if (button.kind !== 'text') {
        toastOf(state, { kind: 'bot-unsupported' });
        return;
      }
      say(state, keyboard.message, button.text);
      if (keyboard.singleUse) {
        hide(true);
      }
    },
  };
};

/** The keyboard's button beside the box: shows or hides it. */
export const KeyboardToggle = ({ reply }) => {
  const t = useT();
  if (!reply.keyboard) {
    return null;
  }
  return el(
    'button',
    {
      key: 'kb',
      type: 'button',
      className: reply.shown
        ? 'icon-btn bot-kb-toggle is-on'
        : 'icon-btn bot-kb-toggle',
      'data-action': 'bot-keyboard',
      'aria-pressed': reply.shown ? 'true' : 'false',
      'aria-label': t(
        reply.shown ? 'chat.bot.hideKeyboard' : 'chat.bot.showKeyboard'
      ),
      title: t(reply.shown ? 'chat.bot.hideKeyboard' : 'chat.bot.showKeyboard'),
      onClick: reply.toggle,
    },
    el(Icon, { name: 'keyboard', size: 20 })
  );
};

/** The keyboard itself, under the box. */
export const ReplyKeyboard = ({ reply }) => {
  const t = useT();
  if (!reply.shown) {
    return null;
  }
  const { rows, resize } = reply.keyboard;
  return el(
    'div',
    {
      key: 'reply-kb',
      className: resize ? 'reply-keyboard is-fit' : 'reply-keyboard',
      role: 'group',
      'aria-label': t('chat.bot.keyboard'),
    },
    rows.map((row, r) =>
      el(
        'div',
        { key: r, className: 'bot-row' },
        row.map((button, c) =>
          el(BotButton, {
            key: c,
            button,
            busy: false,
            onPress: () => reply.press(button),
          })
        )
      )
    )
  );
};
