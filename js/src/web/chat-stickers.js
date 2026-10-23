/**
 * Stickers and GIFs in the emoji panel, as Telegram Desktop's (R-Y105;
 * learned, never copied). The Stickers tab: the favourite stickers, the
 * recently sent ones, then each of the user's sets, each set's stickers
 * asked as the list comes to it, with a bar of the sets below to jump
 * between them. The GIFs tab: the saved GIFs, playing while on screen. A
 * click sends the sticker or GIF to the chat at once (as a reply, when
 * one is being written) and closes the panel.
 *
 * A search box over each tab (R-Y112): an emoji or words find stickers
 * and sticker sets, the user's or not; words find GIFs as Telegram's
 * apps do (its @gif bot), more as the list is scrolled to its end.
 *
 * Only for a Telegram chat of a user account; the pictures come through
 * the server (/api/telegram/sticker), never from Telegram to the page.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Icon } from './icons.js';
import { useNearView } from './chat-media.js';
import { mediaSrc } from './media-src.js';
import { jumpTo, useInView } from './chat-emoji.js';
import { LottieSticker } from './lottie-sticker.js';

const el = React.createElement;

/** Can this chat take stickers: a Telegram chat of a user account. */
export const canStickers = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramStickers === 'function' &&
  typeof api?.telegramSendDocument === 'function';

const moving = (item) => item.format === 'webm' || item.format === 'mp4';
const animated = (item) => item.format === 'tgs';

// The answers kept while the page is open, so the panel opens on them
// at once (and asks again behind).
const kept = new Map();

/** Forget what was kept (tests). */
export const forgetStickers = () => kept.clear();

// `api[method](body)`'s answer, kept by `key`; asked again when `fresh`.
const useAnswer = (api, method, body, { key, when = true, fresh = false }) => {
  const [answer, setAnswer] = useState(() => kept.get(key) ?? null);
  useEffect(() => {
    if (!when || (kept.has(key) && !fresh)) {
      setAnswer(kept.get(key) ?? null);
      return undefined;
    }
    let active = true;
    Promise.resolve(api[method](body))
      .then((got) => {
        if (got?.ok) {
          kept.set(key, got);
        }
        if (active) {
          setAnswer(got ?? { error: 'no answer' });
        }
      })
      .catch((error) => active && setAnswer({ error: error.message }));
    return () => {
      active = false;
    };
  }, [api, method, key, when]);
  return answer;
};

const useStickerUrl = (api, args, when) => {
  const [url, setUrl] = useState(null);
  const key = JSON.stringify(args);
  useEffect(() => {
    if (!when || typeof api?.telegramStickerUrl !== 'function') {
      return undefined;
    }
    let active = true;
    api
      .telegramStickerUrl(args)
      .then((next) => active && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, key, when]);
  return url;
};

// A sticker's or GIF's picture once near the view; a video one plays
// while on screen, as Telegram's panel.
const Picture = ({ api, item }) => {
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const picture = useStickerUrl(api, { id: item.id }, near);
  const video = useStickerUrl(
    api,
    { id: item.id, full: true },
    near && (moving(item) || animated(item))
  );
  const [broken, setBroken] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const still =
    picture && !broken
      ? el('img', {
          key: 'i',
          ...mediaSrc(picture),
          alt: item.emoji ?? '',
          draggable: false,
          loading: 'lazy',
          onError: () => setBroken(true),
        })
      : null;
  let shown =
    still ?? el('span', { className: 'sticker-empty' }, item.emoji ?? '');
  if (video && animated(item)) {
    // An animation plays while on screen, its picture over it till then.
    shown = [
      el(LottieSticker, {
        key: 'l',
        src: video,
        play: visible,
        onReady: setDrawn,
      }),
      drawn ? null : still,
    ];
  } else if (video && visible) {
    shown = el('video', {
      ...mediaSrc(video),
      autoPlay: true,
      muted: true,
      loop: true,
      playsInline: true,
      poster: picture ?? undefined,
    });
  }
  return el('span', { ref, className: 'sticker-picture' }, shown);
};

const Cell = ({ api, item, onSend }) => {
  const t = useT();
  const label =
    item.kind === 'gif' ? t('chat.stickers.gif') : (item.emoji ?? '');
  return el(
    'button',
    {
      type: 'button',
      className: item.kind === 'gif' ? 'gif-cell' : 'sticker-cell',
      title: label || t('chat.stickers.sticker'),
      'aria-label': label || t('chat.stickers.sticker'),
      'data-sticker': item.id,
      onClick: () => onSend(item),
    },
    el(Picture, { api, item })
  );
};

const Grid = ({ api, list, onSend, gifs = false }) =>
  el(
    'div',
    { className: gifs ? 'gif-grid' : 'sticker-grid' },
    list.map((item) => el(Cell, { key: item.id, api, item, onSend }))
  );

const Section = ({ id, title, children }) =>
  el('section', { className: 'emoji-section', 'data-category': id }, [
    el('h4', { key: 'h', className: 'emoji-section-title' }, title),
    el(React.Fragment, { key: 'g' }, children),
  ]);

// A set's stickers, asked once the list comes near it; until then a
// space as tall as they will be, so the bar's jumps land.
const SetSection = ({ api, set, onSend }) => {
  const ref = useRef(null);
  const { near } = useNearView(ref);
  const answer = useAnswer(
    api,
    'telegramStickerSet',
    { id: set.id },
    { key: `set:${set.id}`, when: near }
  );
  const list = answer?.stickers ?? null;
  const rows = Math.ceil(Math.max(1, set.count) / 5);
  return el(
    'div',
    { ref },
    el(
      Section,
      { id: `set:${set.id}`, title: set.title },
      list
        ? el(Grid, { api, list, onSend })
        : el('div', {
            className: 'sticker-pending',
            style: { height: `${rows * 4.25}rem` },
          })
    )
  );
};

const SetThumb = ({ api, set }) => {
  const url = useStickerUrl(api, { set: set.id }, true);
  const [broken, setBroken] = useState(false);
  return url && !broken
    ? el('img', {
        ...mediaSrc(url),
        alt: '',
        draggable: false,
        onError: () => setBroken(true),
      })
    : el('span', { className: 'sticker-set-letter' }, set.title.slice(0, 1));
};

const Bar = ({ api, sections, inView, jump }) => {
  const t = useT();
  return el(
    'div',
    { className: 'emoji-cats sticker-sets', role: 'toolbar' },
    sections.map((s) =>
      el(
        'button',
        {
          key: s.key,
          type: 'button',
          className: inView === s.key ? 'emoji-cat active' : 'emoji-cat',
          title: s.set ? s.set.title : t(`chat.stickers.${s.key}`),
          'aria-label': s.set ? s.set.title : t(`chat.stickers.${s.key}`),
          'data-jump': s.key,
          onClick: () => jump(s.key),
        },
        s.set
          ? el(SetThumb, { api, set: s.set })
          : el(Icon, { name: s.key === 'faved' ? 'star' : 'clock', size: 18 })
      )
    )
  );
};

const Note = ({ text }) => el('p', { className: 'emoji-none' }, text);

const failure = (answer, t) =>
  answer?.supported === false
    ? t('chat.stickers.unavailable')
    : t('chat.stickers.failed');

// What is typed in a search box, once typing pauses.
const useDebounced = (value, ms = 350) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => setSettled(value), ms);
    return () => globalThis.clearTimeout(timer);
  }, [value, ms]);
  return settled;
};

const SearchBox = ({ field, value, onChange }) => {
  const t = useT();
  return el('input', {
    type: 'search',
    className: 'emoji-search',
    placeholder: t(`chat.stickers.${field}`),
    'aria-label': t(`chat.stickers.${field}`),
    'data-field': field,
    value,
    onChange: (event) => onChange(event.target.value),
  });
};

const canSearch = (api, method) => typeof api?.[method] === 'function';

// Stickers found for an emoji or words, then the sets found.
const FoundStickers = ({ api, q, onSend }) => {
  const t = useT();
  const lang = String(useLocaleContext().locale ?? 'en').slice(0, 2);
  const answer = useAnswer(
    api,
    'telegramStickerSearch',
    { q, lang },
    { key: `search:${lang}:${q}` }
  );
  if (!answer) {
    return el(Note, { text: t('chat.stickers.loading') });
  }
  if (!answer.ok) {
    return el(Note, { text: failure(answer, t) });
  }
  if (answer.stickers.length === 0 && answer.sets.length === 0) {
    return el(Note, { text: t('chat.stickers.notFound') });
  }
  return [
    answer.stickers.length
      ? el(
          Section,
          { key: 'found', id: 'found', title: t('chat.stickers.found') },
          el(Grid, { api, list: answer.stickers, onSend })
        )
      : null,
    ...answer.sets.map((set) =>
      el(SetSection, { key: `set:${set.id}`, api, set, onSend })
    ),
  ];
};

/** The Stickers tab. */
export const StickersTab = ({ api, onSend }) => {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const search = canSearch(api, 'telegramStickerSearch');
  return el(React.Fragment, null, [
    search
      ? el(SearchBox, {
          key: 'q',
          field: 'stickerSearch',
          value: query,
          onChange: setQuery,
        })
      : null,
    search && q
      ? el(
          'div',
          { key: 'found', className: 'emoji-scroll', 'data-found': q },
          el(FoundStickers, { api, q, onSend })
        )
      : el(MyStickers, { key: 'mine', api, onSend }),
  ]);
};

// The user's own: favourites, recent, their sets with the bar.
const MyStickers = ({ api, onSend }) => {
  const t = useT();
  const scroller = useRef(null);
  const answer = useAnswer(
    api,
    'telegramStickers',
    {},
    { key: 'panel', fresh: true }
  );
  const sections = answer?.ok
    ? [
        ...(answer.faved.length ? [{ key: 'faved', list: answer.faved }] : []),
        ...(answer.recent.length
          ? [{ key: 'recent', list: answer.recent }]
          : []),
        ...answer.sets.map((set) => ({ key: `set:${set.id}`, set })),
      ]
    : [];
  const inView = useInView(scroller, [sections.length], sections[0]?.key);
  let body = el(Note, { text: t('chat.stickers.loading') });
  if (answer && !answer.ok) {
    body = el(Note, { text: failure(answer, t) });
  } else if (answer?.ok && sections.length === 0) {
    body = el(Note, { text: t('chat.stickers.none') });
  } else if (answer?.ok) {
    body = sections.map((s) =>
      s.set
        ? el(SetSection, { key: s.key, api, set: s.set, onSend })
        : el(
            Section,
            { key: s.key, id: s.key, title: t(`chat.stickers.${s.key}`) },
            el(Grid, { api, list: s.list, onSend })
          )
    );
  }
  return el(React.Fragment, null, [
    el('div', { key: 's', className: 'emoji-scroll', ref: scroller }, body),
    sections.length > 1
      ? el(Bar, {
          key: 'bar',
          api,
          sections,
          inView,
          jump: (key) => jumpTo(scroller, key),
        })
      : null,
  ]);
};

// GIFs found by words, a page at a time.
const useGifPages = (api, q) => {
  const [pages, setPages] = useState({ q: null, gifs: [], next: null });
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const ask = async (offset) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    const answer = await Promise.resolve(
      api.telegramGifSearch({ q, ...(offset ? { offset } : {}) })
    ).catch((e) => ({ error: e.message }));
    busy.current = false;
    if (!answer?.ok) {
      setError(answer ?? { error: 'no answer' });
      return;
    }
    setPages((now) => ({
      q,
      gifs: offset && now.q === q ? [...now.gifs, ...answer.gifs] : answer.gifs,
      next: answer.next ?? null,
    }));
  };
  useEffect(() => {
    setError(null);
    setPages({ q: null, gifs: [], next: null });
    ask('');
  }, [api, q]);
  return {
    ...pages,
    done: pages.q === q,
    error,
    more: () => pages.next && ask(pages.next),
  };
};

// The list's end: near the view, the next page.
const More = ({ onNear }) => {
  const ref = useRef(null);
  const { near } = useNearView(ref);
  useEffect(() => {
    if (near) {
      onNear();
    }
  }, [near]);
  return el('div', { ref, className: 'gif-more' });
};

const FoundGifs = ({ api, q, onSend }) => {
  const t = useT();
  const found = useGifPages(api, q);
  if (found.error) {
    return el(Note, { text: failure(found.error, t) });
  }
  if (!found.done) {
    return el(Note, { text: t('chat.stickers.loading') });
  }
  if (found.gifs.length === 0) {
    return el(Note, { text: t('chat.stickers.notFound') });
  }
  return [
    el(Grid, { key: 'g', api, list: found.gifs, onSend, gifs: true }),
    found.next
      ? el(More, { key: `more:${found.gifs.length}`, onNear: found.more })
      : null,
  ];
};

/** The GIFs tab. */
export const GifsTab = ({ api, onSend }) => {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const search = canSearch(api, 'telegramGifSearch');
  return el(React.Fragment, null, [
    search
      ? el(SearchBox, {
          key: 'q',
          field: 'gifSearch',
          value: query,
          onChange: setQuery,
        })
      : null,
    search && q
      ? el(
          'div',
          {
            key: 'found',
            className: 'emoji-scroll gif-scroll',
            'data-found': q,
          },
          el(FoundGifs, { api, q, onSend })
        )
      : el(SavedGifs, { key: 'saved', api, onSend }),
  ]);
};

const SavedGifs = ({ api, onSend }) => {
  const t = useT();
  const answer = useAnswer(
    api,
    'telegramGifs',
    {},
    { key: 'gifs', fresh: true }
  );
  let body = el(Note, { text: t('chat.stickers.loading') });
  if (answer && !answer.ok) {
    body = el(Note, { text: failure(answer, t) });
  } else if (answer?.ok && answer.gifs.length === 0) {
    body = el(Note, { text: t('chat.stickers.noGifs') });
  } else if (answer?.ok) {
    body = el(Grid, { api, list: answer.gifs, onSend, gifs: true });
  }
  return el('div', { className: 'emoji-scroll gif-scroll' }, body);
};

let sent = 0;

/**
 * The Stickers and GIFs tabs for the composer's emoji panel: none
 * unless the chat can take them. A pick is sent at once.
 */
export const useStickerTabs = ({ state, api, composer }) => {
  const t = useT();
  if (!canStickers(state, api)) {
    return [];
  }
  const send = async (item, close) => {
    close();
    sent += 1;
    const replyTo = composer?.replyTo?.msgId;
    const answer = await api.telegramSendDocument({
      chat: String(state.current.chat),
      id: item.id,
      ...(replyTo ? { replyTo } : {}),
      clientId: `doc-${Date.now()}-${sent}`,
    });
    if (answer?.ok) {
      composer?.clearReplyTo?.();
      return;
    }
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not sent',
      retryAfter: answer?.retryAfter,
    });
  };
  return [
    {
      key: 'stickers',
      label: t('chat.stickers.title'),
      render: (close) =>
        el(StickersTab, { api, onSend: (item) => send(item, close) }),
    },
    {
      key: 'gifs',
      label: t('chat.stickers.gifs'),
      render: (close) =>
        el(GifsTab, { api, onSend: (item) => send(item, close) }),
    },
  ];
};
