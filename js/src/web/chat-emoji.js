import { getLocalStorage } from '../storage/local-storage.js';

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
 * stay in this browser. Other tabs (stickers and GIFs, ./chat-stickers.js)
 * come from the composer; the chosen tab is remembered.
 *
 * Emoji that take a skin tone (R-Y114) carry a corner mark; a right click
 * or a press held ~0.4 s opens the six variants above it, and the tone
 * picked is remembered for that emoji, in the panel and in search.
 *
 * Search finds emoji by Telegram's words for them in the page's
 * language (R-Y117; messages.getEmojiKeywords, through the server) when
 * a Telegram user account is there, then by their English names.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Icon } from './icons.js';
import { EMOJI_CATEGORIES, EMOJI_TONES } from './emoji-data.js';
import {
  CustomCell,
  GroupEmojiSection,
  GridSection,
  GroupTabs,
  InstalledSections,
  PremiumNote,
  saveJson,
  storedJson,
  useCustomPanel,
  useCustomTools,
} from './chat-emoji-custom.js';

const el = React.createElement;

const RECENT_KEY = 'meta-sovereign.emoji.recent';
const TAB_KEY = 'meta-sovereign.emoji.tab';
const TONES_KEY = 'meta-sovereign.emoji.tones';
const RECENT_MAX = 32;
const HOLD_MS = 400;
const POPOVER_W = 228;
const POPOVER_H = 48;
const TONE_NAMES = [
  'default',
  'light',
  'mediumLight',
  'medium',
  'mediumDark',
  'dark',
];
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

const NONE = [];
const TONE_MARK = /[\u{1F3FB}-\u{1F3FF}]/u;

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
  'group-emoji': 'star',
  custom: 'star',
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

// An emoji without FE0F and a tone: as Telegram's word lists may name it.
const bare = (emoji) =>
  emoji
    .replace(/\uFE0F/g, '')
    .replace(/\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, '');

let barely = null;
const byBare = () => {
  if (!barely) {
    barely = new Map();
    for (const { list } of emojiCategories()) {
      for (const item of list) {
        barely.set(bare(item.emoji), item);
      }
    }
  }
  return barely;
};

/**
 * The standard emoji a group's `emoticons` name (Telegram's emoji groups,
 * R-Y214), in the group's order.
 */
export const itemsOfEmoticons = (emoticons) => {
  const index = byBare();
  const found = new Map();
  for (const emoticon of emoticons ?? []) {
    const item = index.get(bare(String(emoticon)));
    if (item && !found.has(item.emoji)) {
      found.set(item.emoji, item);
    }
  }
  return [...found.values()];
};

/**
 * The emoji Telegram's `keywords` (`{ word: [emoji…] }`) give for
 * `query`: the words it begins, the shortest (the word itself) first.
 */
export const findByKeywords = (query, keywords, limit = 120) => {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q || !keywords) {
    return [];
  }
  const words = Object.keys(keywords)
    .filter((word) => word.startsWith(q))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const index = byBare();
  const found = new Map();
  for (const word of words) {
    for (const emoji of keywords[word]) {
      const item = index.get(bare(emoji));
      if (item && !found.has(item.emoji)) {
        found.set(item.emoji, item);
        if (found.size >= limit) {
          return [...found.values()];
        }
      }
    }
  }
  return [...found.values()];
};

/**
 * The emoji for `query`: by Telegram's `keywords` when given, then those
 * whose English name has every word of it, in panel order.
 */
export const findEmoji = (query, limit = 120, keywords = null) => {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const found = new Map(
    findByKeywords(query, keywords, limit).map((item) => [item.emoji, item])
  );
  for (const { list } of emojiCategories()) {
    for (const item of list) {
      if (found.size >= limit) {
        return [...found.values()];
      }
      const name = item.name.toLowerCase();
      if (!found.has(item.emoji) && words.every((w) => name.includes(w))) {
        found.set(item.emoji, item);
      }
    }
  }
  return [...found.values()];
};

// Telegram's words per language, asked once a page (`source(lang)`).
const keywordLists = new Map();

/** Forget the words asked (tests). */
export const forgetKeywords = () => keywordLists.clear();

const keywordsOf = (source, lang) => {
  if (!keywordLists.has(lang)) {
    const forget = () => {
      keywordLists.delete(lang);
      return null;
    };
    keywordLists.set(
      lang,
      Promise.resolve(source(lang))
        .then((answer) => (answer?.ok ? answer.keywords : forget()))
        .catch(forget)
    );
  }
  return keywordLists.get(lang);
};

// The words for the page's language, once something is searched.
export const useKeywords = (source, searching) => {
  const lang = String(useLocaleContext()?.locale ?? 'en').slice(0, 2);
  const [words, setWords] = useState(null);
  const latest = useRef(source);
  latest.current = source;
  const able = typeof source === 'function';
  useEffect(() => {
    if (!able || !searching) {
      return undefined;
    }
    let live = true;
    keywordsOf((l) => latest.current(l), lang).then(
      (got) => live && setWords(got)
    );
    return () => {
      live = false;
    };
  }, [able, searching, lang]);
  return able ? words : null;
};

/** The emoji (without a tone) that take a skin tone. */
export const toneBases = new Set(EMOJI_TONES.split('|'));

/**
 * `emoji` in tone 1-5 (light to dark; 0 or none is the default): the tone
 * goes after the first code point, which drops its FE0F.
 */
export const tonedForm = (emoji, tone) => {
  if (!tone || !toneBases.has(emoji)) {
    return emoji;
  }
  const [first, ...rest] = [...emoji];
  const left = rest[0] === '\uFE0F' ? rest.slice(1) : rest;
  return [first, String.fromCodePoint(0x1f3fa + tone), ...left].join('');
};

/** The remembered tones, `{ base: 1-5 }`. */
export const readTones = (storage = getLocalStorage()) => {
  try {
    const saved = JSON.parse(storage?.getItem(TONES_KEY) ?? 'null');
    const tones = {};
    for (const [base, tone] of Object.entries(saved ?? {})) {
      if (toneBases.has(base) && tone >= 1 && tone <= 5) {
        tones[base] = tone;
      }
    }
    return tones;
  } catch {
    return {};
  }
};

/** `tones` with `base` in `tone` (0 forgets it), saved. */
export const rememberTone = (
  tones,
  base,
  tone,
  storage = getLocalStorage()
) => {
  const next = { ...tones };
  delete next[base];
  if (tone > 0) {
    next[base] = tone;
  }
  try {
    storage?.setItem(TONES_KEY, JSON.stringify(next));
  } catch {
    // Private mode: remembered until the page closes.
  }
  return next;
};

/** `recent` with `emoji` put first, at most RECENT_MAX. */
export const withRecent = (recent, emoji) =>
  [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);

const readRecent = (storage) => {
  const saved = storedJson(RECENT_KEY, storage);
  return Array.isArray(saved) && saved.every((e) => typeof e === 'string')
    ? saved.slice(0, RECENT_MAX)
    : FIRST_RECENT;
};

const saveRecent = (recent, storage) => saveJson(RECENT_KEY, recent, storage);

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
// A menu or dialog opened from the panel (a sticker's, R-Y115) is drawn
// on the page's body: pressing in it, or the Escape that closes it, is
// not leaving the panel.
const OVER_PANEL = '.msg-context-menu, .delete-dialog-overlay';

const overPanel = () =>
  Boolean(globalThis.document?.querySelector?.(OVER_PANEL));

const useClosing = (open, close, inside) => {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const key = (event) => {
      if (event.key === 'Escape' && !overPanel()) {
        close();
      }
    };
    const press = (event) => {
      const inPanel = inside.some((ref) =>
        ref.current?.contains?.(event.target)
      );
      if (!inPanel && !event.target?.closest?.(OVER_PANEL)) {
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

// A press held HOLD_MS, or a right click, asks for the tones.
const useHold = (ask) => {
  const hold = useRef({ timer: null, fired: false });
  const stop = () => {
    globalThis.clearTimeout(hold.current.timer);
  };
  return {
    stop,
    start: (event) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.currentTarget;
      hold.current.fired = false;
      stop();
      hold.current.timer = globalThis.setTimeout(() => {
        hold.current.fired = true;
        ask(target);
      }, HOLD_MS);
    },
    // True once, right after a hold: that release is no pick.
    held: () => {
      const { fired } = hold.current;
      hold.current.fired = false;
      return fired;
    },
  };
};

const Cell = ({ item, onPick, toning }) => {
  const base = item.emoji;
  const tonable = Boolean(toning) && toneBases.has(base);
  const hold = useHold((target) => toning.open(base, target));
  const shown = tonable ? tonedForm(base, toning.tones[base]) : base;
  const extra = tonable
    ? {
        'data-tonable': base,
        onPointerDown: hold.start,
        onPointerUp: hold.stop,
        onPointerLeave: hold.stop,
        onPointerCancel: hold.stop,
        onContextMenu: (event) => {
          event.preventDefault();
          hold.stop();
          toning.open(base, event.currentTarget);
        },
      }
    : {};
  return el(
    'button',
    {
      type: 'button',
      className: 'emoji-cell',
      title: item.name,
      'aria-label': item.name,
      'data-emoji': shown,
      ...extra,
      onClick: () => {
        if (!hold.held()) {
          onPick(shown);
        }
      },
    },
    shown
  );
};

const Section = ({ id, title, list, onPick, toning, extra = NONE }) =>
  el(GridSection, { id, title }, [
    ...list.map((item) => el(Cell, { key: item.emoji, item, onPick, toning })),
    ...extra,
  ]);

// The six variants of a base emoji over (or under) its cell; Escape or a
// press elsewhere closes just this.
const TonePopover = ({ at, tones, pick, close }) => {
  const t = useT();
  const ref = useRef(null);
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const press = (event) => {
      if (!ref.current?.contains(event.target)) {
        close();
      }
    };
    globalThis.addEventListener('keydown', key, true);
    globalThis.addEventListener('pointerdown', press, true);
    return () => {
      globalThis.removeEventListener('keydown', key, true);
      globalThis.removeEventListener('pointerdown', press, true);
    };
  }, [close]);
  return el(
    'div',
    {
      ref,
      className: 'emoji-tones',
      role: 'group',
      'aria-label': t('chat.emoji.tones'),
      'data-emoji-tones': at.base,
      style: { left: at.left, top: at.top },
    },
    TONE_NAMES.map((name, tone) => {
      const variant = tonedForm(at.base, tone);
      return el(
        'button',
        {
          key: name,
          type: 'button',
          className:
            (tones[at.base] ?? 0) === tone ? 'emoji-tone active' : 'emoji-tone',
          title: t(`chat.emoji.tone.${name}`),
          'aria-label': t(`chat.emoji.tone.${name}`),
          'data-tone': tone,
          'data-emoji': variant,
          onClick: () => pick(variant, tone),
        },
        variant
      );
    })
  );
};

// Where the popover goes: over the cell, or under it near the panel's top.
const popoverAt = (base, target) => {
  const panel = target.closest('.emoji-panel')?.getBoundingClientRect();
  const cell = target.getBoundingClientRect();
  if (!panel) {
    return null;
  }
  const left = cell.left - panel.left + cell.width / 2 - POPOVER_W / 2;
  const above = cell.top - panel.top - POPOVER_H - 4;
  return {
    base,
    left: Math.max(4, Math.min(left, panel.width - POPOVER_W - 4)),
    top: above >= 0 ? above : cell.bottom - panel.top + 4,
  };
};

const named = (list) => {
  const names = new Map();
  for (const { list: items } of emojiCategories()) {
    for (const item of items) {
      names.set(item.emoji, item.name);
    }
  }
  return list.map((emoji) => ({
    emoji,
    name: names.get(emoji) ?? names.get(emoji.replace(TONE_MARK, '')) ?? emoji,
  }));
};

// The section in view, for the bar below.
export const useInView = (scroller, deps, first = 'recent') => {
  const [inView, setInView] = useState(first);
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

/** Scroll `scroller` to its section `key` (letters, digits, colons). */
export const jumpTo = (scroller, key) => {
  const box = scroller.current;
  const section = box?.querySelector(`[data-category="${key}"]`);
  if (box && section) {
    box.scrollTop = section.offsetTop - box.offsetTop;
  }
};

// The standard emoji, as the panel lists them: Telegram's emoji group when
// one is chosen, else the recent ones (with the recent custom emoji) and
// the categories (R-Y214).
const standardSections = ({ group, sections, tools, pickCustom, toning }) => {
  if (group) {
    return [
      {
        key: 'group',
        title: group.title,
        list: itemsOfEmoticons(group.emoticons),
      },
    ];
  }
  return sections
    .filter((s) => s.list.length > 0)
    .map((s) => ({
      ...s,
      toning: s.key === 'recent' ? null : toning,
      extra:
        s.key === 'recent' && tools
          ? tools.recent.map((item) =>
              el(CustomCell, {
                key: `custom-${item.id}`,
                item,
                api: tools.api,
                onPick: pickCustom,
              })
            )
          : NONE,
    }));
};

// The scrolling part: search results, or the group's pack, the standard
// sections and the account's custom emoji sets.
const EmojiScroll = ({
  scroller,
  searching,
  found,
  chosen,
  shown,
  tools,
  panel,
  onPick,
  toning,
}) => {
  const t = useT();
  let body;
  if (searching) {
    body =
      found.length > 0
        ? el(Section, {
            id: 'found',
            title: t('chat.emoji.found'),
            list: found,
            onPick,
            toning,
          })
        : el('p', { className: 'emoji-none' }, t('chat.emoji.none'));
  } else {
    body = [
      chosen
        ? null
        : el(GroupEmojiSection, {
            key: 'group-emoji',
            tools,
            onPick: panel.pick,
          }),
      ...shown.map((s) =>
        el(Section, {
          key: s.key,
          id: s.key,
          title: s.title ?? t(`chat.emoji.cat.${s.key}`),
          list: s.list,
          onPick,
          toning: s.toning,
          extra: s.extra,
        })
      ),
      chosen || !tools
        ? null
        : el(InstalledSections, {
            key: 'installed',
            tools,
            sets: panel.sets,
            onPick: panel.pick,
          }),
    ];
  }
  return el('div', { className: 'emoji-scroll', ref: scroller }, body);
};

// The bar below: a button per section to jump to.
const CategoryBar = ({ bar, inView, jump }) => {
  const t = useT();
  return el(
    'div',
    { className: 'emoji-cats', role: 'toolbar' },
    bar.map((s) =>
      el(
        'button',
        {
          key: s.key,
          type: 'button',
          className: inView === s.key ? 'emoji-cat active' : 'emoji-cat',
          title: t(`chat.emoji.cat.${s.key}`),
          'aria-label': t(`chat.emoji.cat.${s.key}`),
          'data-jump': s.key,
          onClick: () => jump(s.target ?? s.key),
        },
        el(Icon, { name: CATEGORY_ICONS[s.key], size: 18 })
      )
    )
  );
};

// The bar's buttons: the group's pack, the standard sections, the sets.
const barOf = (sections, tools, sets) => [
  ...(tools?.groupSet?.shortName ? [{ key: 'group-emoji' }] : []),
  ...sections,
  ...(sets?.length > 0 ? [{ key: 'custom', target: `set-${sets[0].id}` }] : []),
];

const EmojiTab = ({
  recent,
  onPick,
  tones,
  onTone,
  keywords,
  featured,
  tools,
}) => {
  const t = useT();
  const panel = useCustomPanel(tools);
  const { group } = panel;
  const [query, setQuery] = useState('');
  // The trending custom emoji sets over the panel (R-Y206).
  const [trending, setTrending] = useState(false);
  const scroller = useRef(null);
  const words = useKeywords(keywords, query.trim().length > 0);
  const found = useMemo(() => findEmoji(query, 120, words), [query, words]);
  const sections = useMemo(
    () => [{ key: 'recent', list: named(recent) }, ...emojiCategories()],
    [recent]
  );
  const inView = useInView(scroller, [query]);
  const [at, setAt] = useState(null);
  const closeTones = useMemo(() => () => setAt(null), []);
  const toning = {
    tones,
    open: (base, target) => setAt(popoverAt(base, target)),
  };
  const pickTone = (variant, tone) => {
    onPick(variant);
    onTone(at.base, tone);
    setAt(null);
  };
  const jump = (key) => jumpTo(scroller, key);
  const bar = barOf(sections, tools, panel.sets);
  const searching = query.trim().length > 0;
  const chosen = searching ? null : group;
  const shown = standardSections({
    group: chosen,
    sections,
    tools,
    pickCustom: panel.pick,
    toning,
  });
  if (trending && featured) {
    return featured(() => setTrending(false));
  }
  return el(React.Fragment, null, [
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
    el(GroupTabs, {
      key: 'groups',
      groups: searching ? NONE : (panel.info?.groups ?? NONE),
      active: group,
      api: tools?.api,
      onPick: panel.setGroup,
    }),
    panel.note ? el(PremiumNote, { key: 'note' }) : null,
    featured && !searching
      ? el(
          'button',
          {
            key: 'trending',
            type: 'button',
            className: 'sticker-trending-button',
            'data-action': 'emoji-trending',
            onClick: () => setTrending(true),
          },
          t('chat.extras.trendingEmoji')
        )
      : null,
    el(EmojiScroll, {
      key: 's',
      scroller,
      searching,
      found,
      chosen,
      shown,
      tools,
      panel,
      onPick,
      toning,
    }),
    at
      ? el(TonePopover, {
          key: 'tones',
          at,
          tones,
          pick: pickTone,
          close: closeTones,
        })
      : null,
    searching || chosen
      ? null
      : el(CategoryBar, { key: 'c', bar, inView, jump }),
  ]);
};

const readTab = () => {
  try {
    return getLocalStorage()?.getItem(TAB_KEY) || 'emoji';
  } catch {
    return 'emoji';
  }
};

const saveTab = (key) => {
  try {
    getLocalStorage()?.setItem(TAB_KEY, key);
  } catch {
    // Private mode: the emoji tab next time.
  }
};

// Emoji, Stickers, GIFs: the tabs on top, when there is more than emoji.
const Tabs = ({ tabs, shown, choose }) => {
  const t = useT();
  return el(
    'div',
    { className: 'emoji-tabs', role: 'tablist' },
    tabs.map((tab) =>
      el(
        'button',
        {
          key: tab.key,
          type: 'button',
          role: 'tab',
          className: tab.key === shown ? 'emoji-tab active' : 'emoji-tab',
          'aria-selected': tab.key === shown ? 'true' : 'false',
          'data-tab': tab.key,
          onClick: () => choose(tab.key),
        },
        tab.label ?? t('chat.emoji.tab')
      )
    )
  );
};

const Panel = ({
  recent,
  onPick,
  tones,
  onTone,
  panelRef,
  extra,
  close,
  keywords,
  featured,
  tools,
}) => {
  const t = useT();
  const [chosen, setChosen] = useState(readTab);
  const tabs = [{ key: 'emoji' }, ...extra];
  const shown = tabs.some((tab) => tab.key === chosen) ? chosen : 'emoji';
  const choose = (key) => {
    setChosen(key);
    saveTab(key);
  };
  const other = extra.find((tab) => tab.key === shown);
  return el(
    'div',
    {
      ref: panelRef,
      className: 'emoji-panel',
      role: 'dialog',
      'aria-label': t('chat.emoji.title'),
      'data-tab': shown,
    },
    [
      extra.length > 0 ? el(Tabs, { key: 'tabs', tabs, shown, choose }) : null,
      other
        ? el(React.Fragment, { key: shown }, other.render(close))
        : el(EmojiTab, {
            key: 'emoji',
            recent,
            onPick,
            tones,
            onTone,
            keywords,
            featured,
            tools,
          }),
    ]
  );
};

/**
 * The panel for a message box: `box` is its textarea's ref, `setText`
 * sets its text; `extra` more tabs (`{ key, label, render(close) }`);
 * `keywords(lang)` Telegram's words for emoji, when there are any;
 * `featured(back)` the trending custom emoji sets (R-Y206), when offered;
 * `custom` ({ api, groupSet }) the Premium emoji, the group's pack and
 * Telegram's emoji groups (R-Y214), when a Telegram user account is there.
 * Answers `{ button, panel }` to put in the composer.
 */
export const useEmojiPanel = ({
  box,
  setText,
  extra = NONE,
  keywords = null,
  featured = null,
  custom = null,
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const [tones, setTones] = useState(readTones);
  const onTone = (base, tone) =>
    setTones((now) => rememberTone(now, base, tone));
  const button = useRef(null);
  const panelRef = useRef(null);
  const [inside] = useState(() => [button, panelRef]);
  const close = useMemo(() => () => setOpen(false), []);
  useClosing(open, close, inside);
  const tools = useCustomTools(custom, (text) =>
    insertAtCaret(box.current, text, setText)
  );
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
      ? el(Panel, {
          key: 'emoji-panel',
          recent,
          onPick: pick,
          tones,
          onTone,
          panelRef,
          extra,
          close,
          keywords,
          featured,
          tools,
        })
      : null,
  };
};
