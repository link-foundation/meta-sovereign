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
 * A right click on a sticker or GIF (R-Y115), as Telegram Desktop's: send
 * it without sound, schedule it, add a sticker to the favourites or take
 * it off them, take it off the recent ones, save a GIF or delete it from
 * the saved ones.
 *
 * A set found that is not the user's has an Add button by its title
 * (R-Y116), as Desktop's: it joins the user's sets.
 *
 * An installed set's title has a Remove button (R-Y124): after an
 * in-page question the set leaves the user's sets. A click on a sticker
 * in a chat opens the set's box instead (./chat-sticker-box.js).
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
import { MsgContextMenu } from './chat-message.js';
import {
  canSchedule,
  isReminderChat,
  ScheduleDialog,
} from './chat-schedule.js';
import { composerReplyId } from './forum-topics.js';
import { RemoveSetDialog } from './chat-sticker-box.js';
import { sendAsField } from './chat-send-as.js';
import { FeaturedSets } from './chat-sticker-trending.js';

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

/** Forget the saved GIFs kept: they changed elsewhere (R-Y171). */
export const forgetGifs = () => kept.delete('gifs');

// Who wants to know when the panel saved or deleted a GIF (R-Y171).
const gifWatchers = new Set();

/** `fn()` runs when the panel's menu changed the saved GIFs; returns the stop. */
export const watchGifs = (fn) => {
  gifWatchers.add(fn);
  return () => gifWatchers.delete(fn);
};

// `api[method](body)`'s answer, kept by `key`; asked again when `fresh`.
const useAnswer = (
  api,
  method,
  body,
  { key, when = true, fresh = false, version = 0 }
) => {
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
  }, [api, method, key, when, version]);
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
export const Picture = ({ api, item }) => {
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

const Cell = ({ api, item, onSend, onMenu }) => {
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
      onContextMenu: (event) => {
        if (onMenu) {
          event.preventDefault();
          onMenu(item, { x: event.clientX, y: event.clientY });
        }
      },
    },
    el(Picture, { api, item })
  );
};

// `where` (faved, recent, set, found, saved, foundGif) tells the menu
// what it may offer.
export const Grid = ({ api, list, onSend, onMenu, where, gifs = false }) =>
  el(
    'div',
    { className: gifs ? 'gif-grid' : 'sticker-grid' },
    list.map((item) =>
      el(Cell, {
        key: item.id,
        api,
        item,
        onSend,
        onMenu: onMenu && ((it, point) => onMenu(it, point, where)),
      })
    )
  );

const Section = ({ id, title, action = null, children }) =>
  el('section', { className: 'emoji-section', 'data-category': id }, [
    action
      ? el('div', { key: 'h', className: 'sticker-set-head' }, [
          el('h4', { key: 't', className: 'emoji-section-title' }, title),
          action,
        ])
      : el('h4', { key: 'h', className: 'emoji-section-title' }, title),
    el(React.Fragment, { key: 'g' }, children),
  ]);

// The sets added while the page is open (a search's answer is kept).
const added = new Set();

// A found set's Add button; `onAdd(set)` resolves true once it is added.
export const AddSet = ({ set, onAdd }) => {
  const t = useT();
  const [state, setState] = useState(
    set.installed || added.has(set.id) ? 'added' : 'add'
  );
  if (state === 'added') {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'sticker-set-add',
      'data-add-set': set.id,
      disabled: state === 'busy',
      onClick: async () => {
        setState('busy');
        const ok = await onAdd(set);
        if (ok) {
          added.add(set.id);
        }
        setState(ok ? 'added' : 'add');
      },
    },
    t('chat.stickers.addSet')
  );
};

// An installed set's Remove button; `onRemove(set)` asks first.
const RemoveSet = ({ set, onRemove }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'sticker-set-add sticker-set-remove',
      'data-remove-set': set.id,
      onClick: () => onRemove(set),
    },
    t('chat.stickers.removeSet')
  );
};

// A set's stickers, asked once the list comes near it; until then a
// space as tall as they will be, so the bar's jumps land.
export const SetSection = ({
  api,
  set,
  onSend,
  onMenu,
  onAdd,
  onRemove,
  mark = null,
}) => {
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
      {
        id: `set:${set.id}`,
        title: mark
          ? el(
              React.Fragment,
              null,
              set.title,
              el('span', { className: 'sticker-new' }, mark)
            )
          : set.title,
        action:
          onAdd && set.installed === false
            ? el(AddSet, { key: 'add', set, onAdd })
            : onRemove && set.installed !== false
              ? el(RemoveSet, { key: 'remove', set, onRemove })
              : null,
      },
      list
        ? el(Grid, { api, list, onSend, onMenu, where: 'set' })
        : el('div', {
            className: 'sticker-pending',
            style: { height: `${rows * 4.25}rem` },
          })
    )
  );
};

export const SetThumb = ({ api, set }) => {
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

export const Note = ({ text }) => el('p', { className: 'emoji-none' }, text);

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
const FoundStickers = ({ api, q, onSend, onMenu, onAdd }) => {
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
          el(Grid, {
            api,
            list: answer.stickers,
            onSend,
            onMenu,
            where: 'found',
          })
        )
      : null,
    ...answer.sets.map((set) =>
      el(SetSection, {
        key: `set:${set.id}`,
        api,
        set,
        onSend,
        onMenu,
        onAdd,
      })
    ),
  ];
};

/** The Stickers tab. */
export const StickersTab = ({
  api,
  onSend,
  onMenu,
  onAdd,
  onRemove,
  version,
}) => {
  const t = useT();
  const [query, setQuery] = useState('');
  // The trending sets over the panel (R-Y206).
  const [trending, setTrending] = useState(false);
  const q = useDebounced(query.trim());
  const search = canSearch(api, 'telegramStickerSearch');
  if (trending) {
    return el(FeaturedSets, {
      api,
      onSend,
      onMenu,
      onAdd,
      onBack: () => setTrending(false),
    });
  }
  return el(React.Fragment, null, [
    search
      ? el(SearchBox, {
          key: 'q',
          field: 'stickerSearch',
          value: query,
          onChange: setQuery,
        })
      : null,
    canSearch(api, 'telegramStickerFeatured')
      ? el(
          'button',
          {
            key: 'trending',
            type: 'button',
            className: 'sticker-trending-button',
            'data-action': 'sticker-trending',
            onClick: () => setTrending(true),
          },
          t('chat.extras.trending')
        )
      : null,
    search && q
      ? el(
          'div',
          { key: 'found', className: 'emoji-scroll', 'data-found': q },
          el(FoundStickers, { api, q, onSend, onMenu, onAdd })
        )
      : el(MyStickers, { key: 'mine', api, onSend, onMenu, onRemove, version }),
  ]);
};

// The user's own: favourites, recent, their sets with the bar.
const MyStickers = ({ api, onSend, onMenu, onRemove, version }) => {
  const t = useT();
  const scroller = useRef(null);
  const answer = useAnswer(
    api,
    'telegramStickers',
    {},
    { key: 'panel', fresh: true, version }
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
        ? el(SetSection, {
            key: s.key,
            api,
            set: s.set,
            onSend,
            onMenu,
            onRemove,
          })
        : el(
            Section,
            { key: s.key, id: s.key, title: t(`chat.stickers.${s.key}`) },
            el(Grid, { api, list: s.list, onSend, onMenu, where: s.key })
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

const FoundGifs = ({ api, q, onSend, onMenu }) => {
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
    el(Grid, {
      key: 'g',
      api,
      list: found.gifs,
      onSend,
      onMenu,
      where: 'foundGif',
      gifs: true,
    }),
    found.next
      ? el(More, { key: `more:${found.gifs.length}`, onNear: found.more })
      : null,
  ];
};

/** The GIFs tab. */
export const GifsTab = ({ api, onSend, onMenu, version }) => {
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
          el(FoundGifs, { api, q, onSend, onMenu })
        )
      : el(SavedGifs, { key: 'saved', api, onSend, onMenu, version }),
  ]);
};

const SavedGifs = ({ api, onSend, onMenu, version }) => {
  const t = useT();
  const answer = useAnswer(
    api,
    'telegramGifs',
    {},
    { key: 'gifs', fresh: true, version }
  );
  let body = el(Note, { text: t('chat.stickers.loading') });
  if (answer && !answer.ok) {
    body = el(Note, { text: failure(answer, t) });
  } else if (answer?.ok && answer.gifs.length === 0) {
    body = el(Note, { text: t('chat.stickers.noGifs') });
  } else if (answer?.ok) {
    body = el(Grid, {
      api,
      list: answer.gifs,
      onSend,
      onMenu,
      where: 'saved',
      gifs: true,
    });
  }
  return el('div', { className: 'emoji-scroll gif-scroll' }, body);
};

let sent = 0;

// A menu item's action on the server (./sources/telegram-stickers.js).
const SAVE_ACTIONS = {
  faveSticker: 'fave',
  unfaveSticker: 'unfave',
  removeRecent: 'unrecent',
  saveGif: 'saveGif',
  deleteGif: 'unsaveGif',
};

const keptHas = (key, list, id) =>
  (kept.get(key)?.[list] ?? []).some((item) => item.id === id);

/**
 * What a sticker's or GIF's menu offers, `where` it was clicked; in Saved
 * Messages scheduling is "Set a reminder" (R-Y197).
 */
export const stickerMenuItems = (
  item,
  where,
  { schedule = false, reminder = false } = {}
) => {
  const later = reminder ? 'scheduleReminder' : 'schedule';
  const items = ['sendSilent', ...(schedule ? [later] : [])];
  if (item.kind === 'gif') {
    return [
      ...items,
      where === 'saved' || keptHas('gifs', 'gifs', item.id)
        ? 'deleteGif'
        : 'saveGif',
    ];
  }
  return [
    ...items,
    where === 'faved' || keptHas('panel', 'faved', item.id)
      ? 'unfaveSticker'
      : 'faveSticker',
    ...(where === 'recent' ? ['removeRecent'] : []),
  ];
};

// Sends a sticker or GIF: `when` { silent, scheduleDate }.
const useSend =
  ({ state, api, composer }) =>
  async (item, close, when) => {
    close();
    sent += 1;
    const replyTo = composerReplyId(composer);
    const answer = await api.telegramSendDocument({
      chat: String(state.current.chat),
      id: item.id,
      ...(replyTo ? { replyTo } : {}),
      ...when,
      ...sendAsField(state.current.chat),
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

// The menu, the schedule dialog, and the saves: what changes is asked
// again (`version`).
const useStickerMenu = ({ state, api, send }) => {
  const [menu, setMenu] = useState(null);
  const [later, setLater] = useState(null);
  const [version, setVersion] = useState(0);
  const [removing, setRemoving] = useState(null);
  const save = async (item, action) => {
    const answer = await Promise.resolve(
      api.telegramStickerSave?.({ id: item.id, action })
    ).catch((error) => ({ error: error.message }));
    if (answer?.ok) {
      setVersion((v) => v + 1);
      if (/Gif$/.test(action)) {
        gifWatchers.forEach((fn) => fn());
      }
      return;
    }
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not saved',
      retryAfter: answer?.retryAfter,
    });
  };
  const act = (key) => {
    const { item, close } = menu;
    if (key === 'sendSilent') {
      send(item, close, { silent: true });
    } else if (key === 'schedule' || key === 'scheduleReminder') {
      setLater({ item, close });
    } else if (SAVE_ACTIONS[key]) {
      save(item, SAVE_ACTIONS[key]);
    }
  };
  // A found set added to the user's (R-Y116).
  const add = async (set) => {
    const answer = await Promise.resolve(
      api.telegramStickerSetInstall?.({ id: set.id, install: true })
    ).catch((error) => ({ error: error.message }));
    if (answer?.ok) {
      setVersion((v) => v + 1);
      return true;
    }
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not added',
      retryAfter: answer?.retryAfter,
    });
    return false;
  };
  // An installed set taken from the user's, once confirmed (R-Y124).
  const remove = async () => {
    const { set } = removing;
    setRemoving(null);
    const answer = await Promise.resolve(
      api.telegramStickerSetInstall?.({ id: set.id, install: false })
    ).catch((error) => ({ error: error.message }));
    if (answer?.ok) {
      kept.delete(`set:${set.id}`);
      setVersion((v) => v + 1);
      return;
    }
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not removed',
      retryAfter: answer?.retryAfter,
    });
  };
  const schedule = canSchedule(state, api);
  const reminder = isReminderChat(state);
  const open = (close) => (item, point, where) =>
    setMenu({
      item,
      close,
      ...point,
      items: stickerMenuItems(item, where, { schedule, reminder }),
    });
  const parts = [
    menu
      ? el(MsgContextMenu, {
          key: 'sticker-menu',
          x: menu.x,
          y: menu.y,
          message: { pending: true },
          items: menu.items,
          reactions: false,
          onClose: () => setMenu(null),
          onAction: act,
        })
      : null,
    later
      ? el(ScheduleDialog, {
          key: 'sticker-when',
          reminder,
          onClose: () => setLater(null),
          onPick: (at) =>
            send(later.item, later.close, {
              scheduleDate: Math.floor(at / 1000),
            }),
        })
      : null,
    removing
      ? el(RemoveSetDialog, {
          key: 'sticker-remove',
          set: removing.set,
          onClose: () => setRemoving(null),
          onConfirm: remove,
        })
      : null,
  ];
  return {
    open,
    add,
    parts,
    version,
    remove: (set) => setRemoving({ set }),
  };
};

/**
 * The Stickers and GIFs tabs for the composer's emoji panel: none
 * unless the chat can take them. A pick is sent at once; a right click
 * opens its menu. `{ tabs, parts }`: `parts` (the menu, the schedule
 * dialog) are drawn by the composer, so they outlive the panel.
 */
export const useStickerTabs = ({ state, api, composer }) => {
  const t = useT();
  const send = useSend({ state, api, composer });
  const menu = useStickerMenu({ state, api, send });
  if (!canStickers(state, api)) {
    return { tabs: [], parts: null, featuredEmoji: null };
  }
  const props = (close) => ({
    api,
    onSend: (item) => send(item, close),
    onMenu: menu.open(close),
    onAdd: menu.add,
    onRemove: menu.remove,
    version: menu.version,
  });
  return {
    tabs: [
      {
        key: 'stickers',
        label: t('chat.stickers.title'),
        render: (close) => el(StickersTab, props(close)),
      },
      {
        key: 'gifs',
        label: t('chat.stickers.gifs'),
        render: (close) => el(GifsTab, props(close)),
      },
    ],
    parts: menu.parts,
    // The trending custom emoji sets, for the emoji tab (R-Y206).
    featuredEmoji:
      typeof api.telegramStickerFeatured === 'function'
        ? (back) =>
            el(FeaturedSets, {
              api,
              emojis: true,
              onAdd: menu.add,
              onBack: back,
            })
        : null,
  };
};
