// Which reactions a group or channel allows (R-Y160; learned, never
// copied), as Telegram Desktop's "Reactions" in Manage group / channel:
// those who may change the chat's info get "Reactions" in the info column.
// A group offers All / Some / No reactions; a channel has no "all", only
// "Enable reactions" and which ones. With "Some" a grid of the emoji
// Telegram offers (the inactive ones left out) with a checkbox each. The
// setting is read with the chat's info (`reactions`, `canSetReactions`);
// everyone sees its effect: the reactions the message menu offers (and
// the double-click reaction) are only the allowed ones, and none when
// none are allowed.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';

const el = React.createElement;

/** The reactions the menu offers in one tap, as Telegram's first row. */
export const DEFAULT_REACTIONS = Object.freeze([
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🔥',
]);

const ROW_MAX = 12;

/**
 * The reactions to offer for a chat's setting (`{ mode, emojis? }`): the
 * usual ones when it allows all or is unknown, only the named ones for
 * "some", none for "none".
 */
export const allowedReactions = (setting) => {
  if (setting?.mode === 'none') {
    return [];
  }
  if (setting?.mode === 'some' && Array.isArray(setting.emojis)) {
    return setting.emojis.slice(0, ROW_MAX);
  }
  return DEFAULT_REACTIONS;
};

/** Whether the info column offers the setting: the server allowed it. */
export const hasReactions = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canSetReactions) &&
  Boolean(info?.reactions);

// What was set here lately, per chat: the server keeps a chat's info for
// a minute, so a setting just saved is believed over it for a little longer.
const BELIEVE_MS = 90_000;
const changed = new Map(); // chat -> { setting, at }
const listeners = new Set();

/** The setting to use: just saved here, else the chat's info, else none. */
export const settingOf = (chat, info, now = Date.now()) => {
  const mine = changed.get(String(chat));
  if (mine && now - mine.at < BELIEVE_MS) {
    return mine.setting;
  }
  return info?.reactions ?? null;
};

const remember = (chat, setting) => {
  changed.set(String(chat), { setting, at: Date.now() });
  listeners.forEach((listener) => listener());
};

/** The chat's setting, following changes made in the dialog. */
export const useChatReactions = (chat, info) => {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return chat?.source === 'telegram' ? settingOf(chat.chat, info) : null;
};

const AllowedContext = createContext(DEFAULT_REACTIONS);

/** The reactions the current chat's messages offer. */
export const useAllowedReactions = () => useContext(AllowedContext);

/** Gives a chat's messages the reactions it allows. */
export const ChatReactionsScope = ({ chat, info, children }) =>
  el(
    AllowedContext.Provider,
    { value: allowedReactions(useChatReactions(chat, info)) },
    children
  );

const errorText = (t, code) => {
  const key = `chat.reactions.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.reactions.err.failed') : text;
};

const MODE_KEYS = {
  all: 'chat.reactions.all',
  some: 'chat.reactions.some',
  none: 'chat.reactions.none',
};

const modeWords = (t, setting) => {
  if (setting.mode === 'some') {
    return t('chat.reactions.count', { count: setting.emojis?.length ?? 0 });
  }
  return t(MODE_KEYS[setting.mode]);
};

const useAvailable = (api) => {
  const [state, setState] = useState({ phase: 'loading', list: [] });
  useEffect(() => {
    let live = true;
    api
      .telegramAvailableReactions()
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', list: answer.reactions ?? [] }
              : { phase: 'error', code: answer?.code ?? 'failed', list: [] }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const ModeChoice = ({ mode, value, disabled, onPick, t }) =>
  el('label', { className: 'admin-toggle' }, [
    el('input', {
      key: 'i',
      type: 'radio',
      name: 'chat-reactions-mode',
      'data-reactions-mode': mode,
      checked: value === mode,
      disabled,
      onChange: () => onPick(mode),
    }),
    el('span', { key: 'l' }, t(MODE_KEYS[mode])),
  ]);

const EmojiGrid = ({ list, picked, disabled, onToggle }) =>
  el(
    'div',
    { className: 'reactions-grid', role: 'group' },
    list.map((r) =>
      el(
        'label',
        {
          key: r.emoji,
          className: picked.includes(r.emoji)
            ? 'reactions-cell is-on'
            : 'reactions-cell',
          title: r.title,
        },
        [
          el('input', {
            key: 'i',
            type: 'checkbox',
            'data-reaction': r.emoji,
            checked: picked.includes(r.emoji),
            disabled,
            onChange: () => onToggle(r.emoji),
          }),
          el('span', { key: 'e' }, r.emoji),
        ]
      )
    )
  );

// What the dialog starts from: the chat's setting; a channel that says
// "all" has every offered reaction on.
const startOf = (setting, broadcast, list) => {
  if (setting.mode === 'all' && broadcast) {
    return { mode: 'some', picked: list.map((r) => r.emoji) };
  }
  return { mode: setting.mode, picked: setting.emojis ?? [] };
};

const sameSetting = (setting, mode, picked) =>
  setting.mode === mode &&
  (mode !== 'some' ||
    (picked.length === (setting.emojis ?? []).length &&
      picked.every((e) => setting.emojis.includes(e))));

const Switch = ({ on, disabled, onChange, t }) =>
  el('label', { className: 'admin-toggle' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-reactions-enable': 'true',
      checked: on,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 'l' }, t('chat.reactions.enable')),
  ]);

const DialogBody = ({ api, chat, broadcast, setting, list, close }) => {
  const t = useT();
  const start = startOf(setting, broadcast, list);
  const [mode, setMode] = useState(start.mode);
  const [picked, setPicked] = useState(start.picked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toggle = (emoji) =>
    setPicked((now) =>
      now.includes(emoji) ? now.filter((e) => e !== emoji) : [...now, emoji]
    );
  const save = async () => {
    setBusy(true);
    setError(null);
    const answer = await api
      .telegramChatReactionsSet({
        chat,
        mode,
        ...(mode === 'some' ? { reactions: picked } : {}),
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      remember(chat, mode === 'some' ? { mode, emojis: picked } : { mode });
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const empty = mode === 'some' && picked.length === 0;
  return el('div', { className: 'admin-body' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.reactions.hint')),
    broadcast
      ? el(Switch, {
          key: 'sw',
          on: mode !== 'none',
          disabled: busy,
          onChange: (on) => setMode(on ? 'some' : 'none'),
          t,
        })
      : ['all', 'some', 'none'].map((m) =>
          el(ModeChoice, {
            key: m,
            mode: m,
            value: mode,
            disabled: busy,
            onPick: setMode,
            t,
          })
        ),
    mode === 'some'
      ? el(EmojiGrid, {
          key: 'g',
          list,
          picked,
          disabled: busy,
          onToggle: toggle,
        })
      : null,
    empty
      ? el('p', { key: 'm', className: 'meta' }, t('chat.reactions.empty'))
      : null,
    error
      ? el(
          'p',
          {
            key: 'e',
            className: 'comments-failed',
            role: 'alert',
            'data-reactions-error': error,
          },
          errorText(t, error)
        )
      : null,
    el(
      'button',
      {
        key: 's',
        type: 'button',
        className: 'primary',
        'data-action': 'reactions-save',
        disabled: busy || empty || sameSetting(setting, mode, picked),
        onClick: save,
      },
      t('chat.reactions.save')
    ),
  ]);
};

const ReactionsDialog = ({ api, chat, info, setting, close }) => {
  const t = useT();
  const available = useAvailable(api);
  let body = el('p', { className: 'meta' }, t('chat.reactions.loading'));
  if (available.phase === 'error') {
    body = el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, available.code)
    );
  } else if (available.phase === 'ready') {
    body = el(DialogBody, {
      api,
      chat: String(chat.chat),
      broadcast: Boolean(info.broadcast),
      setting,
      list: available.list,
      close,
    });
  }
  return el(
    Frame,
    { title: t('chat.reactions.title'), close, name: 'chat-reactions' },
    body
  );
};

/** "Reactions" in the info column for those who may change it, or nothing. */
export const ReactionsAction = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const setting = useChatReactions(chat, info);
  if (!hasReactions(chat, info) || !setting) {
    return null;
  }
  return el('div', { className: 'admin-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'chat-reactions',
        onClick: () => setOpen(true),
      },
      [
        t('chat.reactions.open'),
        el(
          'span',
          { key: 'p', className: 'meta ttl-now', 'data-reactions-now': true },
          ` ${modeWords(t, setting)}`
        ),
      ]
    ),
    open
      ? el(ReactionsDialog, {
          key: 'd',
          api,
          chat,
          info,
          setting,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
