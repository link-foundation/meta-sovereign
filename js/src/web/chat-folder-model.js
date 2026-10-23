// What the folder editor works with, as plain data (R-Y164; Telegram
// Desktop's Settings → Folders, learned, never copied): a draft of a
// folder, the checks before it is sent, the request, a folder moved in the
// order, and the chats to pick from.

import { summarizeChats } from './chat-model.js';

/** Telegram's limit for a folder's name, in letters. */
export const TITLE_MAX = 12;

/** What a folder takes by kind, and what it leaves out. */
export const KINDS_IN = [
  'contacts',
  'nonContacts',
  'groups',
  'broadcasts',
  'bots',
];
export const KINDS_OUT = ['excludeMuted', 'excludeRead', 'excludeArchived'];

/** The icons offered (Telegram's folder icons are emoji). */
export const ICONS = [
  '📁',
  '⭐',
  '💬',
  '👤',
  '👥',
  '📢',
  '🤖',
  '💼',
  '🏠',
  '🎮',
  '📚',
  '✈️',
];

export const letters = (text) => [...String(text ?? '')].length;

/** A folder to edit: Telegram's own, or a blank one (`folder` null). */
export const draftOf = (folder = null) => {
  const f = folder ?? {};
  return {
    id: Number.isInteger(f.id) ? f.id : null,
    title: f.title ?? '',
    emoticon: f.emoticon ?? null,
    // The tag's colour (R-Y180), 0 to 6, or none.
    color: Number.isInteger(f.color) ? f.color : null,
    ...Object.fromEntries(
      [...KINDS_IN, ...KINDS_OUT].map((k) => [k, Boolean(f[k])])
    ),
    include: [...(f.include ?? [])],
    exclude: [...(f.exclude ?? [])],
    pinned: [...(f.pinned ?? [])],
    // A shared folder (R-Y172) takes chats by name only.
    chatlist: Boolean(f.chatlist),
    hasMyInvites: Boolean(f.hasMyInvites),
  };
};

// A folder takes a kind of chat or a chat by name (a shared one, only that).
const takesSomething = (draft) =>
  (!draft.chatlist && KINDS_IN.some((k) => draft[k])) ||
  draft.include.length > 0;

/** Why a draft cannot be sent yet: a code for words, or null. */
export const draftProblem = (draft) => {
  const title = draft.title.trim();
  if (title === '') {
    return 'title-empty';
  }
  if (letters(title) > TITLE_MAX) {
    return 'title-long';
  }
  return takesSomething(draft) ? null : 'include-empty';
};

/** The body of folder-save for a draft (a new folder has no `id`). */
export const requestOf = (draft) => ({
  ...(draft.id === null ? {} : { id: draft.id }),
  folder: {
    title: draft.title.trim(),
    ...(draft.emoticon ? { emoticon: draft.emoticon } : {}),
    ...(Number.isInteger(draft.color) ? { color: draft.color } : {}),
    ...Object.fromEntries(
      [...KINDS_IN, ...KINDS_OUT].map((k) => [
        k,
        draft.chatlist ? false : draft[k],
      ])
    ),
    include: draft.include,
    exclude: draft.chatlist ? [] : draft.exclude,
    pinned: draft.pinned.filter((c) => !draft.exclude.includes(c)),
    ...(draft.chatlist
      ? { chatlist: true, hasMyInvites: draft.hasMyInvites }
      : {}),
  },
});

/**
 * A chat ticked or unticked on one side ('include' or 'exclude'); a chat
 * is never on both sides.
 */
export const withPick = (draft, side, chat) => {
  const other = side === 'include' ? 'exclude' : 'include';
  const has = draft[side].includes(chat);
  return {
    ...draft,
    [side]: has
      ? draft[side].filter((c) => c !== chat)
      : [...draft[side], chat],
    [other]: draft[other].filter((c) => c !== chat),
  };
};

/**
 * The ids of every folder in the order after `id` moves `step` places
 * (-1 up, 1 down) among the named folders; "All chats" (0) stays where
 * Telegram put it. `null` when it cannot move.
 */
export const movedOrder = (folders, id, step) => {
  const from = folders.filter((f) => !f.all).findIndex((f) => f.id === id);
  return movedTo(folders, from, from + step);
};

/**
 * The same, for a folder dragged from place `from` to place `to` among the
 * named folders (R-Y172); `null` when it did not move.
 */
export const movedTo = (folders, from, to) => {
  const named = folders.filter((f) => !f.all).map((f) => f.id);
  const outside = (n) => n < 0 || n >= named.length;
  if (from === to || outside(from) || outside(to)) {
    return null;
  }
  const [lifted] = named.splice(from, 1);
  named.splice(to, 0, lifted);
  let next = 0;
  return folders.map((f) => (f.all ? 0 : named[next++]));
};

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const SLUG = /^[A-Za-z0-9_-]{8,64}$/;

/** The slug of a shared folder's link (t.me/addlist/slug), or null. */
export const addlistSlugOf = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  let slug = null;
  if (url.protocol === 'tg:') {
    slug = url.hostname === 'addlist' ? url.searchParams.get('slug') : null;
  } else if (HOSTS.test(url.hostname)) {
    slug = /^\/addlist\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return SLUG.test(slug ?? '') ? slug : null;
};

/**
 * The folder's groups and channels that a link can carry:
 * `{ chat, name }`, named from `chats` (the picker's list).
 */
export const eligibleChats = (folder, chats = []) => {
  const names = new Map(chats.map((c) => [c.chat, c.name]));
  return (folder.include ?? [])
    .filter((chat) => /^-\d+$/.test(chat))
    .map((chat) => ({ chat, name: names.get(chat) ?? chat }));
};

/**
 * Why a folder cannot be shared (a code), or null: Telegram shares only a
 * folder of chosen groups and channels, no kinds, nothing left out.
 */
export const shareProblem = (folder) => {
  if ([...KINDS_IN, ...KINDS_OUT].some((k) => folder[k])) {
    return 'kinds';
  }
  if ((folder.exclude ?? []).length > 0) {
    return 'excluded';
  }
  return eligibleChats(folder).length === 0 ? 'no-chats' : null;
};

/** The recommended folders not yet among the user's (by name). */
export const freshSuggestions = (suggested = [], folders = []) => {
  const have = new Set(folders.map((f) => String(f.title ?? '').toLowerCase()));
  return suggested.filter(
    (s) => !have.has(String(s.folder?.title ?? '').toLowerCase())
  );
};

/** Telegram chats to pick from, for the picker: `{ chat, name }`. */
export const choicesOf = (links = []) =>
  summarizeChats(links)
    .filter((c) => c.source === 'telegram')
    .map((c) => ({ chat: String(c.chat), name: c.name ?? String(c.chat) }));

/** A refusal's code as the key of its words. */
export const errorKey = (t, code) => {
  const key = `chat.folderEdit.err.${code}`;
  return t(key) === key ? t('chat.folderEdit.err.failed') : t(key);
};

/** How many colours Telegram has for a folder's tag (R-Y180). */
export const TAG_COLORS = 7;

/** Whether `folder` is a tag now: tags are on and it has a colour. */
export const isTag = (folder, enabled) =>
  Boolean(enabled) &&
  !folder?.all &&
  Number.isInteger(folder?.color) &&
  folder.color >= 0 &&
  folder.color < TAG_COLORS;

/** The window event that says the folders changed (R-Y164). */
export const FOLDERS_CHANGED = 'meta-sovereign:folders-changed';

export const announceFolders = () =>
  globalThis.dispatchEvent?.(new globalThis.Event(FOLDERS_CHANGED));

/**
 * A folder write from a dialog: busy while Telegram answers, then the
 * folders are announced and the dialog closes, or the error is shown.
 */
export const folderWrite = async (ask, { t, setBusy, setError, close }) => {
  setBusy(true);
  const answer = await ask().catch(() => null);
  setBusy(false);
  if (answer?.ok) {
    announceFolders();
    close();
  } else {
    setError(errorKey(t, answer?.code ?? 'failed'));
  }
};
