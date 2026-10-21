/**
 * The emoji panel by the message box, as Telegram Desktop's (R-Y104;
 * learned, never copied): the smiley button opens it above the box; the
 * recently used ones first, then the categories (people, nature, food,
 * activity, travel, objects, symbols, flags) with a bar to jump between
 * them and a search by name. A pick goes in at the caret as typing does
 * (so Undo takes it back) and the panel stays open for more; Escape or a
 * click elsewhere closes it.
 *
 * The emoji are Unicode's (./emoji-data.js, generated); the recent ones
 * stay in this browser.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { EMOJI_CATEGORIES } from './emoji-data.js';

const el = React.createElement;

const RECENT_KEY = 'meta-sovereign.emoji.recent';
const RECENT_MAX = 32;
// Before anything is picked: the ones people use most, as Telegram's
// panel starts.
const FIRST_RECENT = [
  '😂',
  '😘',
  '❤️',
  '😍',
  '😊',
  '😁',
  '👍',
  '☺️',
  '😔',
  '😄',
  '😭',
  '💋',
  '😒',
  '😳',
  '😜',
  '🙈',
  '😉',
  '😃',
  '😢',
  '😝',
  '😱',
  '😡',
  '😏',
  '😞',
];

const CATEGORY_ICONS = {
  recent: 'clock',
  people: 'smile',
  nature: 'leaf',
  food: 'apple',
  activity: 'ball',
  travel: 'plane',
  objects: 'bulb',
  symbols: 'heart',
  flags: 'flag',
};

/** Every category's emoji as `[{ emoji, name }]`, parsed once. */
export const emojiCategories = (() => {
  let parsed = null;
  return () => {
    parsed ??= Object.entries(EMOJI_CATEGORIES).map(([key, packed]) => ({
      key,
      list: packed.split('|').map((entry) => {
        const at = entry.indexOf('~');
        return { emoji: entry.slice(0, at), name: entry.slice(at + 1) };
      }),
    }));
    return parsed;
  };
})();

/** The emoji whose name has every word of `query`, in panel order. */
export const findEmoji = (query, limit = 120) => {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const found = [];
  for (const { list } of emojiCategories()) {
    for (const item of list) {
      const name = item.name.toLowerCase();
      if (words.every((w) => name.includes(w))) {
        found.push(item);
        if (found.length >= limit) {
          return found;
        }
      }
    }
  }
  return found;
};

/** `recent` with `emoji` put first, at most RECENT_MAX. */
export const withRecent = (recent, emoji) =>
  [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);

const readRecent = (storage = globalThis.localStorage) => {
  try {
    const saved = JSON.parse(storage?.getItem(RECENT_KEY) ?? 'null');
    return Array.isArray(saved) && saved.every((e) => typeof e === 'string')
      ? saved.slice(0, RECENT_MAX)
      : FIRST_RECENT;
  } catch {
    return FIRST_RECENT;
  }
};

const saveRecent = (recent, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Private mode: remembered until the page closes.
  }
};

/**
 * Put `text` in `area` at the caret (over the selection), as typing
 * does; else through `setText`.
 */
export const insertAtCaret = (area, text, setText) => {
  if (!area) {
    return;
  }
  const value = String(area.value ?? '');
  const from = area.selectionStart ?? value.length;
  const to = area.selectionEnd ?? value.length;
  area.focus();
  area.setSelectionRange?.(from, to);
  const typed =
    globalThis.document?.execCommand?.('insertText', false, text) ?? false;
  if (typed && area.value !== value) {
    return;
  }
  setText(value.slice(0, from) + text + value.slice(to));
  const caret = from + text.length;
  globalThis.requestAnimationFrame?.(() => {
    area.setSelectionRange?.(caret, caret);
  });
};

// Escape, or a press outside the panel and its button, closes it.
const useClosing = (open, close, inside) => {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const key = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    const press = (event) => {
      if (!inside.some((ref) => ref.current?.contains?.(event.target))) {
        close();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    globalThis.addEventListener?.('pointerdown', press, true);
    return () => {
      globalThis.removeEventListener?.('keydown', key);
      globalThis.removeEventListener?.('pointerdown', press, true);
    };
  }, [open, close, inside]);
};

const Cell = ({ item, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'emoji-cell',
      title: item.name,
      'aria-label': item.name,
      'data-emoji': item.emoji,
      onClick: () => onPick(item.emoji),
    },
    item.emoji
  );

const Section = ({ id, title, list, onPick }) =>
  el('section', { className: 'emoji-section', 'data-category': id }, [
    el('h4', { key: 'h', className: 'emoji-section-title' }, title),
    el(
      'div',
      { key: 'g', className: 'emoji-grid' },
      list.map((item) => el(Cell, { key: item.emoji, item, onPick }))
    ),
  ]);

const named = (list) => {
  const names = new Map();
  for (const { list: items } of emojiCategories()) {
    for (const item of items) {
      names.set(item.emoji, item.name);
    }
  }
  return list.map((emoji) => ({ emoji, name: names.get(emoji) ?? emoji }));
};

// The section in view, for the bar below.
const useInView = (scroller, deps) => {
  const [inView, setInView] = useState('recent');
  useEffect(() => {
    const box = scroller.current;
    if (!box) {
      return undefined;
    }
    const look = () => {
      const top = box.getBoundingClientRect().top;
      let current = null;
      for (const section of box.querySelectorAll('[data-category]')) {
        if (section.getBoundingClientRect().top - top <= 8) {
          current = section.dataset.category;
        }
      }
      setInView(
        current ?? box.querySelector('[data-category]')?.dataset.category
      );
    };
    look();
    box.addEventListener('scroll', look, { passive: true });
    return () => box.removeEventListener('scroll', look);
  }, deps);
  return inView;
};

const Panel = ({ recent, onPick, panelRef }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const scroller = useRef(null);
  const found = useMemo(() => findEmoji(query), [query]);
  const sections = useMemo(
    () => [{ key: 'recent', list: named(recent) }, ...emojiCategories()],
    [recent]
  );
  const inView = useInView(scroller, [query]);
  const jump = (key) => {
    const box = scroller.current;
    const section = box?.querySelector(`[data-category="${key}"]`);
    if (box && section) {
      box.scrollTop = section.offsetTop - box.offsetTop;
    }
  };
  const searching = query.trim().length > 0;
  return el(
    'div',
    {
      ref: panelRef,
      className: 'emoji-panel',
      role: 'dialog',
      'aria-label': t('chat.emoji.title'),
    },
    [
      el('input', {
        key: 'q',
        type: 'search',
        className: 'emoji-search',
        placeholder: t('chat.emoji.search'),
        'aria-label': t('chat.emoji.search'),
        'data-field': 'emoji-search',
        value: query,
        onChange: (event) => setQuery(event.target.value),
      }),
      el(
        'div',
        { key: 's', className: 'emoji-scroll', ref: scroller },
        searching
          ? found.length > 0
            ? el(Section, {
                id: 'found',
                title: t('chat.emoji.found'),
                list: found,
                onPick,
              })
            : el('p', { className: 'emoji-none' }, t('chat.emoji.none'))
          : sections
              .filter((s) => s.list.length > 0)
              .map((s) =>
                el(Section, {
                  key: s.key,
                  id: s.key,
                  title: t(`chat.emoji.cat.${s.key}`),
                  list: s.list,
                  onPick,
                })
              )
      ),
      searching
        ? null
        : el(
            'div',
            { key: 'c', className: 'emoji-cats', role: 'toolbar' },
            sections.map((s) =>
              el(
                'button',
                {
                  key: s.key,
                  type: 'button',
                  className:
                    inView === s.key ? 'emoji-cat active' : 'emoji-cat',
                  title: t(`chat.emoji.cat.${s.key}`),
                  'aria-label': t(`chat.emoji.cat.${s.key}`),
                  'data-jump': s.key,
                  onClick: () => jump(s.key),
                },
                el(Icon, { name: CATEGORY_ICONS[s.key], size: 18 })
              )
            )
          ),
    ]
  );
};

/**
 * The panel for a message box: `box` is its textarea's ref, `setText`
 * sets its text. Answers `{ button, panel }` to put in the composer.
 */
export const useEmojiPanel = ({ box, setText }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const button = useRef(null);
  const panelRef = useRef(null);
  const [inside] = useState(() => [button, panelRef]);
  const close = useMemo(() => () => setOpen(false), []);
  useClosing(open, close, inside);
  const pick = (emoji) => {
    insertAtCaret(box.current, emoji, setText);
    const next = withRecent(recent, emoji);
    setRecent(next);
    saveRecent(next);
  };
  return {
    open,
    button: el(
      'button',
      {
        key: 'emoji',
        ref: button,
        type: 'button',
        className: open
          ? 'composer-emoji icon-btn active'
          : 'composer-emoji icon-btn',
        'aria-label': t('chat.emoji.title'),
        'aria-expanded': open ? 'true' : 'false',
        title: t('chat.emoji.title'),
        'data-action': 'emoji',
        onClick: () => setOpen((now) => !now),
      },
      el(Icon, { name: 'smile', size: 20 })
    ),
    panel: open
      ? el(Panel, { key: 'emoji-panel', recent, onPick: pick, panelRef })
      : null,
  };
};
