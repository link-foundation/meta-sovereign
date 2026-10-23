// Chat backgrounds (R-Y155; learned, never copied), as Telegram Desktop's
// "Chat background":
// - Settings lists what Telegram offers (images, patterns over colours,
//   colours only) as a grid, with "No background" and "Upload from file"
//   (a picture used on this device only). The choice is kept in
//   localStorage, so the server is asked only to read;
// - the layer behind the messages draws it, in both themes (an image is
//   dimmed in the dark one); it is a separate layer, not the scroller's
//   own background, so scrolling stays cheap;
// - a chat that has a wallpaper of its own (its info carries it) shows
//   that instead; "Set wallpaper for this chat…" in the chat's info
//   column asks Telegram to set one from the list (for the user only).

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import {
  backgroundVars,
  choiceOf,
  cleanChoice,
  layerKind,
  sameChoice,
} from './wallpaper-css.js';

const el = React.createElement;

export const BACKGROUND_KEY = 'metaSovereignChatBackground';
const NONE = Object.freeze({ kind: 'none' });
const MAX_SIDE = 1600;

const read = () => {
  try {
    const raw = globalThis.localStorage?.getItem(BACKGROUND_KEY);
    return raw ? cleanChoice(JSON.parse(raw)) : NONE;
  } catch {
    // Storage can be disabled, or hold something that is not ours.
    return NONE;
  }
};

const write = (choice) => {
  try {
    globalThis.localStorage?.setItem(BACKGROUND_KEY, JSON.stringify(choice));
  } catch {
    // See read(): the choice then lasts until the page closes.
  }
};

let state = null;
const own = new Map(); // chat -> a wallpaper just set for it here
const listeners = new Set();
const current = () => (state ??= read());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const tell = () => listeners.forEach((listener) => listener());

/** Makes `choice` the app's chat background and keeps it. */
export const setBackground = (choice) => {
  state = cleanChoice(choice);
  write(state);
  tell();
};

/** A wallpaper just set for a chat, believed over its (cached) info. */
export const rememberOwn = (chat, wallpaper) => {
  own.set(String(chat), wallpaper);
  tell();
};

/** The app's background, following changes. */
export const useBackground = () =>
  useSyncExternalStore(subscribe, current, current);

// The background of a chat: the one set for it, else the app's.
const useChatChoice = (chat, info) => {
  const global = useBackground();
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  const mine = own.get(String(chat)) ?? info?.wallpaper;
  const choice = mine ? choiceOf(mine) : NONE;
  return choice.kind === 'none' ? global : choice;
};

// The address of a wallpaper's picture (a pattern's file too), once known.
const usePictureUrl = (api, choice, size) => {
  const wp = choice.kind === 'telegram' ? choice.wallpaper : null;
  const [url, setUrl] = useState(null);
  const id = wp?.file ? wp.id : '';
  const slug = wp?.slug ?? '';
  useEffect(() => {
    setUrl(null);
    if (!id || typeof api?.telegramWallpaperUrl !== 'function') {
      return undefined;
    }
    let active = true;
    api
      .telegramWallpaperUrl({ id, slug, size })
      .then((next) => active && setUrl(next))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, id, slug, size]);
  return url;
};

/** The layer that draws a choice; nothing for none. */
export const WallLayer = ({ api, choice, size = 'full' }) => {
  const image = usePictureUrl(api, choice, size);
  const kind = layerKind(choice);
  if (kind === 'none') {
    return null;
  }
  return el('div', {
    className: 'chat-wall-layer',
    'data-wall': kind,
    'aria-hidden': 'true',
    style: backgroundVars(choice, { image }),
  });
};

/** Behind the open chat's messages: its own wallpaper, else the app's. */
export const ChatWall = ({ api, chat, info }) => {
  const choice = useChatChoice(chat, info);
  return el(WallLayer, { api, choice });
};

// A picture from this device, scaled down so it fits the page's storage.
export const pictureData = (file) =>
  new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file?.type ?? '')) {
      reject(new Error('not a picture'));
      return;
    }
    const reader = new globalThis.FileReader();
    reader.onerror = () => reject(new Error('unreadable'));
    reader.onload = () => {
      const image = new globalThis.Image();
      image.onerror = () => reject(new Error('not a picture'));
      image.onload = () => {
        const scale = Math.min(
          1,
          MAX_SIDE / Math.max(image.width, image.height, 1)
        );
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas
          .getContext('2d')
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const Tile = ({ api, choice, selected, onPick, label, id }) =>
  el(
    'button',
    {
      type: 'button',
      className: selected ? 'wallpaper-tile is-selected' : 'wallpaper-tile',
      'data-wallpaper': id,
      'data-kind': layerKind(choice),
      'aria-pressed': selected,
      'aria-label': label,
      title: label,
      onClick: onPick,
    },
    el(WallLayer, { api, choice, size: 'thumb' })
  );

// What Telegram offers, asked once when the grid opens.
const useWallpaperList = (api) => {
  const [list, setList] = useState({ status: 'loading', items: [] });
  useEffect(() => {
    let active = true;
    const ask = api?.telegramWallpapers;
    if (typeof ask !== 'function') {
      setList({ status: 'unavailable', items: [] });
      return undefined;
    }
    ask({})
      .then((answer) => {
        if (active) {
          setList(
            answer?.ok
              ? { status: 'ready', items: answer.wallpapers ?? [] }
              : { status: 'unavailable', items: [] }
          );
        }
      })
      .catch(() => active && setList({ status: 'unavailable', items: [] }));
    return () => {
      active = false;
    };
  }, [api]);
  return list;
};

/**
 * The grid of Telegram's wallpapers. `onPick(wallpaper)` gets the page
 * shape of the one clicked; `selected` is the choice to mark; `lead` adds
 * tiles before them (none, upload).
 */
export const WallpaperGrid = ({ api, onPick, selected, lead = [] }) => {
  const t = useT();
  const list = useWallpaperList(api);
  return el('div', { className: 'wallpaper-grid-wrap' }, [
    list.status === 'loading'
      ? el('p', { key: 's', className: 'meta' }, t('chat.wallpaper.loading'))
      : null,
    list.status === 'unavailable'
      ? el(
          'p',
          { key: 's', className: 'meta', 'data-wallpapers': 'unavailable' },
          t('chat.wallpaper.unavailable')
        )
      : null,
    el('div', { key: 'g', className: 'wallpaper-grid', role: 'group' }, [
      ...lead,
      ...list.items.map((wp) => {
        const choice = choiceOf(wp);
        return el(Tile, {
          key: wp.id,
          api,
          choice,
          id: wp.id,
          label: t('chat.wallpaper.item', { name: wp.slug || wp.id }),
          selected: selected ? sameChoice(choice, selected) : false,
          onPick: () => onPick(wp),
        });
      }),
    ]),
  ]);
};

const PlainTile = ({ name, label, selected, onClick, children }) =>
  el(
    'button',
    {
      type: 'button',
      className: selected
        ? 'wallpaper-tile wallpaper-plain is-selected'
        : 'wallpaper-tile wallpaper-plain',
      'data-action': name,
      'aria-pressed': selected,
      onClick,
    },
    el('span', { className: 'wallpaper-plain-label' }, children ?? label)
  );

/** Settings → Chat background. */
export const ChatBackgroundSettings = ({ api }) => {
  const t = useT();
  const choice = useBackground();
  const [problem, setProblem] = useState(false);
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      setProblem(false);
      setBackground({ kind: 'file', dataUrl: await pictureData(file) });
    } catch {
      setProblem(true);
    }
  };
  const lead = [
    el(PlainTile, {
      key: 'none',
      name: 'wallpaper-none',
      label: t('chat.wallpaper.none'),
      selected: choice.kind === 'none',
      onClick: () => setBackground(NONE),
    }),
    el(
      'label',
      {
        key: 'upload',
        className:
          choice.kind === 'file'
            ? 'wallpaper-tile wallpaper-plain is-selected'
            : 'wallpaper-tile wallpaper-plain',
      },
      [
        el('input', {
          key: 'i',
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          'data-action': 'wallpaper-upload',
          className: 'sr-only',
          onChange: upload,
        }),
        el(
          'span',
          { key: 'l', className: 'wallpaper-plain-label' },
          t('chat.wallpaper.upload')
        ),
      ]
    ),
  ];
  return el(
    'section',
    {
      className: 'card chat-background',
      'aria-labelledby': 'chat-background-title',
    },
    [
      el(
        'h3',
        { key: 'h', id: 'chat-background-title' },
        t('chat.wallpaper.title')
      ),
      el('p', { key: 'p', className: 'meta' }, t('chat.wallpaper.intro')),
      problem
        ? el(
            'p',
            { key: 'bad', className: 'comments-failed', role: 'alert' },
            t('chat.wallpaper.badFile')
          )
        : null,
      el(WallpaperGrid, {
        key: 'grid',
        api,
        lead,
        selected: choice,
        onPick: (wp) => setBackground(choiceOf(wp)),
      }),
    ]
  );
};

const errorText = (t, code) => {
  const key = `chat.wallpaper.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.wallpaper.err.failed') : text;
};

const ChatWallpaperDialog = ({ api, chat, close }) => {
  const t = useT();
  const [error, setError] = useState(null);
  const pick = async (wp) => {
    setError(null);
    const answer = await api
      .telegramChatWallpaperSet({ chat: String(chat.chat), id: wp.id })
      .catch(() => null);
    if (answer?.ok) {
      rememberOwn(chat.chat, wp);
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  return el(
    Frame,
    { title: t('chat.wallpaper.chatTitle'), close, name: 'chat-wallpaper' },
    el('div', { className: 'admin-body' }, [
      el('p', { key: 'h', className: 'meta' }, t('chat.wallpaper.chatHint')),
      error
        ? el(
            'p',
            {
              key: 'e',
              className: 'comments-failed',
              role: 'alert',
              'data-wallpaper-error': error,
            },
            errorText(t, error)
          )
        : null,
      el(WallpaperGrid, { key: 'g', api, onPick: pick }),
    ])
  );
};

/** "Set wallpaper for this chat…" in the info column, or nothing. */
export const ChatWallpaperAction = ({ api, chat }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (
    chat?.source !== 'telegram' ||
    !/^-?\d+$/.test(String(chat.chat)) ||
    typeof api?.telegramChatWallpaperSet !== 'function'
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
        'data-action': 'chat-wallpaper',
        onClick: () => setOpen(true),
      },
      t('chat.wallpaper.open')
    ),
    open
      ? el(ChatWallpaperDialog, {
          key: 'd',
          api,
          chat,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
