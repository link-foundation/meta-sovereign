// Chat themes (R-Y170; learned, never copied), as Telegram Desktop's
// "Change colours" has them:
// - a chat with a person has "Change colours" in the info column; it opens
//   a picker of the themes Telegram offers for chats (by emoticon, each with
//   a preview of its accent and outgoing bubble in the app's light or dark
//   mode) and "No theme". Choosing one asks Telegram to set it, the one
//   write, made only on that click;
// - a chat that has a theme (its info carries the emoticon) shows its accent
//   and outgoing bubble colours as CSS variables on the chat view, so the
//   rest of the app is left as it is. The wallpaper of a theme is not drawn
//   here; the chat background (R-Y155) has its own.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { useAppearance } from './appearance.js';
import { previewOf, themeVars } from './chat-theme-model.js';

const el = React.createElement;

const own = new Map(); // chat -> the emoticon just set for it here ('' none)
const listeners = new Set();
let version = 0;
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A theme just set for a chat, believed over its (cached) info. */
export const rememberTheme = (chat, emoticon) => {
  own.set(String(chat), emoticon);
  version += 1;
  listeners.forEach((listener) => listener());
};

const useVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );

// The list Telegram offers, asked once for the page.
let asked = null;
const themeList = (api) => {
  if (!asked) {
    asked = api
      .telegramChatThemes({})
      .then((answer) => (answer?.ok ? (answer.themes ?? []) : null))
      .catch(() => null);
    asked.then((list) => {
      if (!list) {
        asked = null;
      }
    });
  }
  return asked;
};

/** Forgets the list asked for (tests, and a page that reconnects). */
export const forgetThemes = () => {
  asked = null;
};

const useThemes = (api, wanted) => {
  const [state, setState] = useState({ status: 'loading', themes: [] });
  useEffect(() => {
    if (!wanted || typeof api?.telegramChatThemes !== 'function') {
      return undefined;
    }
    let active = true;
    themeList(api).then((list) => {
      if (active) {
        setState(
          list
            ? { status: 'ready', themes: list }
            : { status: 'unavailable', themes: [] }
        );
      }
    });
    return () => {
      active = false;
    };
  }, [api, wanted]);
  return state;
};

/** The emoticon of the theme a chat has: set here, else its info's. */
export const themeEmoticon = (chat, info) =>
  own.has(String(chat)) ? own.get(String(chat)) : (info?.theme ?? '');

/**
 * The props the chat view carries for its chat's theme: the CSS variables
 * of its accent and outgoing bubble, scoped to that view. `{}` for none.
 */
export const useChatTheme = (api, chat, info) => {
  useVersion();
  const { theme: mode } = useAppearance();
  const emoticon =
    chat?.source === 'telegram' ? themeEmoticon(chat.chat, info) : '';
  const { themes } = useThemes(api, emoticon);
  const found = themes.find((th) => th.emoticon === emoticon);
  const vars = found ? themeVars(found, mode === 'dark') : {};
  return Object.keys(vars).length > 0
    ? { style: vars, 'data-chat-theme': emoticon }
    : {};
};

const errorText = (t, code) => {
  const key = `chat.theme.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.theme.err.failed') : text;
};

const Swatch = ({ look }) =>
  el(
    'span',
    {
      className: 'theme-swatch',
      'aria-hidden': 'true',
      style: look
        ? { '--swatch-accent': look.accent, '--swatch-bubble': look.bubble }
        : undefined,
    },
    look ? el('span', { className: 'theme-swatch-bubble' }) : null
  );

const Tile = ({ name, emoticon, label, look, selected, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: selected ? 'theme-tile is-selected' : 'theme-tile',
      'data-theme-tile': name,
      'aria-pressed': selected,
      title: label,
      onClick: onPick,
    },
    [
      el(Swatch, { key: 's', look }),
      el('span', { key: 'e', className: 'theme-tile-emoji' }, emoticon),
      el('span', { key: 'l', className: 'sr-only' }, label),
    ]
  );

const ThemeDialog = ({ api, chat, info, close }) => {
  const t = useT();
  const { theme: mode } = useAppearance();
  const list = useThemes(api, true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const now = themeEmoticon(chat.chat, info);
  const pick = async (emoticon) => {
    setError(null);
    setBusy(true);
    const answer = await api
      .telegramChatThemeSet({ chat: String(chat.chat), emoticon })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      rememberTheme(chat.chat, emoticon);
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  return el(
    Frame,
    { title: t('chat.theme.title'), close, name: 'chat-theme' },
    el('div', { className: 'admin-body' }, [
      el('p', { key: 'h', className: 'meta' }, t('chat.theme.hint')),
      list.status === 'loading'
        ? el('p', { key: 'l', className: 'meta' }, t('chat.theme.loading'))
        : null,
      list.status === 'unavailable'
        ? el(
            'p',
            { key: 'u', className: 'meta', 'data-themes': 'unavailable' },
            t('chat.theme.unavailable')
          )
        : null,
      error
        ? el(
            'p',
            {
              key: 'e',
              className: 'comments-failed',
              role: 'alert',
              'data-theme-error': error,
            },
            errorText(t, error)
          )
        : null,
      el(
        'div',
        {
          key: 'g',
          className: 'theme-grid',
          role: 'group',
          'aria-busy': busy,
        },
        [
          el(Tile, {
            key: 'none',
            name: 'none',
            emoticon: '∅',
            label: t('chat.theme.none'),
            look: null,
            selected: now === '',
            onPick: () => pick(''),
          }),
          ...list.themes.map((theme) =>
            el(Tile, {
              key: theme.emoticon,
              name: theme.emoticon,
              emoticon: theme.emoticon,
              label: theme.title || theme.emoticon,
              look: previewOf(theme, mode === 'dark'),
              selected: now === theme.emoticon,
              onPick: () => pick(theme.emoticon),
            })
          ),
        ]
      ),
    ])
  );
};

/** "Change colours" in the info column of a chat with a person, or nothing. */
export const ChatThemeAction = ({ api, chat, info }) => {
  const t = useT();
  useVersion();
  const [open, setOpen] = useState(false);
  if (
    chat?.source !== 'telegram' ||
    info?.kind !== 'user' ||
    info.self ||
    !/^\d+$/.test(String(chat.chat)) ||
    typeof api?.telegramChatThemeSet !== 'function'
  ) {
    return null;
  }
  return el('div', { className: 'admin-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'chat-theme',
        onClick: () => setOpen(true),
      },
      t('chat.theme.open')
    ),
    open
      ? el(ThemeDialog, {
          key: 'd',
          api,
          chat,
          info,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
