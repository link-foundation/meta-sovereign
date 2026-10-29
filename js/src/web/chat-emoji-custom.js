import { getLocalStorage } from '../storage/local-storage.js';

// Custom emoji in the emoji panel, as Telegram Desktop's offers them
// (R-Y214; learned, never copied): a section for the group's own emoji pack
// ("Group emoji", first, inside that group), one for each custom emoji set
// the account has, the recently used ones with the recent emoji, and
// Telegram's emoji groups ("Love", "Joy"…) as icon tabs that filter the
// standard grid. A pick goes into the message box as the markdown
// `![😀](tg://emoji?id=…)`, which sending turns into a custom emoji
// entity (../sources/telegram-format.js); a user without Premium may
// only use the group's own pack, in that group — else a short note says
// Premium is needed (the panel decides, ./chat-emoji.js).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { CustomEmoji } from './custom-emoji.js';
import { useNearView } from './chat-media.js';

const el = React.createElement;

const RECENT_KEY = 'meta-sovereign.emoji.recentCustom';
const RECENT_MAX = 32;
const KEEP_MS = 60_000;
const FALLBACK = '⭐';
const ID = /^\d{1,20}$/;

/** The markdown a pick types: the fallback emoji and the document's id. */
export const customToken = (id, alt) => {
  const shown = /^[^[\]\s]{1,32}$/u.test(String(alt ?? '')) ? alt : FALLBACK;
  return `![${shown}](tg://emoji?id=${id})`;
};

/** `recent` with `item` ({ id, alt }) put first, at most RECENT_MAX. */
export const withRecentCustom = (recent, item) =>
  [{ id: item.id, alt: item.alt }, ...recent.filter((r) => r.id !== item.id)]
    // The newest first, the oldest dropped.
    .slice(0, RECENT_MAX);

/** What `key` of this device's storage holds (JSON), or null. */
export const storedJson = (key, storage = getLocalStorage()) => {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

/** `value` saved under `key` on this device; private mode forgets it. */
export const saveJson = (key, value, storage = getLocalStorage()) => {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: remembered until the page closes.
  }
};

/** The remembered custom emoji, `[{ id, alt }]`, from this device. */
export const readRecentCustom = (storage) => {
  const saved = storedJson(RECENT_KEY, storage);
  return Array.isArray(saved)
    ? saved
        .filter((r) => r && ID.test(String(r.id)))
        .map((r) => ({ id: String(r.id), alt: String(r.alt ?? FALLBACK) }))
        .slice(0, RECENT_MAX)
    : [];
};

/**
 * The composer's side of custom emoji: `insert(text)` types into the
 * box; answers null when `custom` is null, else `{ api, groupSet, recent,
 * use(item) }` — `use` types the emoji and remembers it.
 */
export const useCustomTools = (custom, insert) => {
  const [recent, setRecent] = useState(readRecentCustom);
  if (!custom) {
    return null;
  }
  return {
    api: custom.api,
    groupSet: custom.groupSet,
    recent,
    use: (item) => {
      insert(customToken(item.id, item.alt));
      const next = withRecentCustom(recent, item);
      setRecent(next);
      saveJson(RECENT_KEY, next);
    },
  };
};

// ---- What Telegram has ---------------------------------------------------

// Answers kept a minute (a page), so the panel opens on them at once.
const kept = new Map();

/** Forget what was kept (tests). */
export const forgetCustomEmoji = () => kept.clear();

const cached = (key, ask) => {
  const entry = kept.get(key);
  if (entry && Date.now() - entry.at < KEEP_MS) {
    return entry.promise;
  }
  const promise = Promise.resolve()
    .then(ask)
    .then((answer) => {
      if (!answer?.ok) {
        kept.delete(key);
      }
      return answer;
    })
    .catch(() => {
      kept.delete(key);
      return null;
    });
  kept.set(key, { at: Date.now(), promise });
  return promise;
};

// `ask()`'s answer once `when` is true: null while asking or on failure.
const useAnswer = (key, ask, when, pick) => {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!when) {
      return undefined;
    }
    let live = true;
    cached(key, ask).then((answer) => {
      if (live && answer?.ok) {
        setValue(pick(answer));
      }
    });
    return () => {
      live = false;
    };
  }, [key, when]);
  return value;
};

/** `{ premium, groups, sets }` (each null until known) for the panel. */
export const useCustomData = (tools, status = false) => {
  const api = tools?.api;
  const info = useAnswer(
    `info:${status}`,
    () => api.telegramEmojiPanelInfo({ status }),
    Boolean(api),
    (a) => ({ premium: Boolean(a.premium), groups: a.groups ?? [] })
  );
  const sets = useAnswer(
    'sets',
    () => api.telegramStickerSets({ emojis: true }),
    Boolean(api),
    (a) => a.sets ?? []
  );
  return { info, sets };
};

/**
 * The panel's custom emoji state: what Telegram has (`info`, `sets`), the
 * chosen emoji group, the Premium note, and `pick(item)` for a custom
 * emoji pressed — which refuses with the note when the account lacks
 * Premium (the group's own pack, `item.own`, is for everyone).
 */
export const useCustomPanel = (tools) => {
  const { info, sets } = useCustomData(tools);
  const [note, setNote] = useState(false);
  const [group, setGroup] = useState(null);
  const pick = (item) => {
    const refused = info?.premium === false && !item.own;
    setNote(refused);
    if (!refused) {
      tools.use(item);
    }
  };
  return { info, sets, note, group, setGroup, pick };
};

// ---- Sections ------------------------------------------------------------

/** One custom emoji as a cell; `item` is `{ id, alt, own? }`. */
export const CustomCell = ({ item, api, onPick }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'emoji-cell custom-emoji-cell',
      title: item.alt || t('chat.emoji.customOne'),
      'aria-label': item.alt || t('chat.emoji.customOne'),
      'data-custom-pick': item.id,
      onClick: () => onPick(item),
    },
    el(CustomEmoji, { id: item.id, text: item.alt || FALLBACK, api })
  );
};

// A set's emoji, asked when the section comes near the view.
const useItems = (load, when) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!when) {
      return undefined;
    }
    let live = true;
    load().then((list) => live && setItems(list));
    return () => {
      live = false;
    };
  }, [when]);
  return items;
};

/** A titled grid of cells, a section of the panel. */
export const GridSection = ({ id, title, className, sectionRef, children }) =>
  el(
    'section',
    {
      ref: sectionRef,
      className: `emoji-section${className ? ` ${className}` : ''}`,
      'data-category': id,
    },
    [
      el('h4', { key: 'h', className: 'emoji-section-title' }, title),
      el('div', { key: 'g', className: 'emoji-grid' }, children),
    ]
  );

const CustomSection = ({ category, title, load, own, api, onPick }) => {
  const ref = useRef(null);
  const { near } = useNearView(ref);
  const items = useItems(load, near);
  return el(
    GridSection,
    { id: category, title, className: 'custom-emoji-section', sectionRef: ref },
    (items ?? []).map((item) =>
      el(CustomCell, { key: item.id, item: { ...item, own }, api, onPick })
    )
  );
};

// The custom emoji of a set (`{ id, alt }`), from a list of panel items.
const emojiOf = (items) =>
  (items ?? []).map((i) => ({ id: String(i.id), alt: i.emoji ?? FALLBACK }));

const loadInstalled = (api, id) => async () => {
  const answer = await cached(`set:${id}`, () =>
    api.telegramStickerSet({ id })
  );
  return emojiOf(answer?.stickers);
};

const loadGroup = (api, shortName) => async () => {
  const answer = await cached(`group:${shortName}`, () =>
    api.telegramStickerSetBox({ shortName })
  );
  return emojiOf(answer?.items);
};

/** The group's emoji pack, under "Group emoji"; null when it has none. */
export const GroupEmojiSection = ({ tools, onPick }) => {
  const t = useT();
  const set = tools?.groupSet;
  return set?.shortName
    ? el(CustomSection, {
        category: 'group-emoji',
        title: t('chat.emoji.groupEmoji'),
        load: loadGroup(tools.api, set.shortName),
        own: true,
        api: tools.api,
        onPick,
      })
    : null;
};

/** The account's custom emoji sets, a section each. */
export const InstalledSections = ({ tools, sets, onPick }) =>
  (sets ?? []).map((set) =>
    el(CustomSection, {
      key: set.id,
      category: `set-${set.id}`,
      title: set.title,
      load: loadInstalled(tools.api, set.id),
      own: false,
      api: tools.api,
      onPick,
    })
  );

// ---- Emoji groups --------------------------------------------------------

/** Telegram's emoji groups as icon tabs; a press picks (or clears) one. */
export const GroupTabs = ({ groups, active, api, onPick }) => {
  const t = useT();
  if (groups.length === 0) {
    return null;
  }
  return el(
    'div',
    {
      className: 'emoji-groups',
      role: 'toolbar',
      'aria-label': t('chat.emoji.groups'),
    },
    groups.map((group) =>
      el(
        'button',
        {
          key: group.title,
          type: 'button',
          className:
            active?.title === group.title
              ? 'emoji-group active'
              : 'emoji-group',
          title: group.title,
          'aria-label': group.title,
          'aria-pressed': active?.title === group.title ? 'true' : 'false',
          'data-emoji-group': group.title,
          onClick: () => onPick(active?.title === group.title ? null : group),
        },
        group.iconEmojiId
          ? el(CustomEmoji, {
              id: group.iconEmojiId,
              text: group.emoticons[0],
              api,
            })
          : group.emoticons[0]
      )
    )
  );
};

/** A line saying custom emoji need Premium. */
export const PremiumNote = () => {
  const t = useT();
  return el(
    'p',
    { className: 'emoji-note', role: 'status', 'data-note': 'premium' },
    t('chat.emoji.premiumNeeded')
  );
};
