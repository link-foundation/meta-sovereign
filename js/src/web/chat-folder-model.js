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
export const draftOf = (folder = null) => ({
  id: folder && Number.isInteger(folder.id) ? folder.id : null,
  title: folder?.title ?? '',
  emoticon: folder?.emoticon ?? null,
  ...Object.fromEntries(
    [...KINDS_IN, ...KINDS_OUT].map((k) => [k, Boolean(folder?.[k])])
  ),
  include: [...(folder?.include ?? [])],
  exclude: [...(folder?.exclude ?? [])],
  pinned: [...(folder?.pinned ?? [])],
});

/** Why a draft cannot be sent yet: a code for words, or null. */
export const draftProblem = (draft) => {
  const title = draft.title.trim();
  if (title === '') {
    return 'title-empty';
  }
  if (letters(title) > TITLE_MAX) {
    return 'title-long';
  }
  const takes = KINDS_IN.some((k) => draft[k]) || draft.include.length > 0;
  return takes ? null : 'include-empty';
};

/** The body of folder-save for a draft (a new folder has no `id`). */
export const requestOf = (draft) => ({
  ...(draft.id === null ? {} : { id: draft.id }),
  folder: {
    title: draft.title.trim(),
    ...(draft.emoticon ? { emoticon: draft.emoticon } : {}),
    ...Object.fromEntries(
      [...KINDS_IN, ...KINDS_OUT].map((k) => [k, draft[k]])
    ),
    include: draft.include,
    exclude: draft.exclude,
    pinned: draft.pinned.filter((c) => !draft.exclude.includes(c)),
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
  const named = folders.filter((f) => !f.all).map((f) => f.id);
  const from = named.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= named.length) {
    return null;
  }
  [named[from], named[to]] = [named[to], named[from]];
  let next = 0;
  return folders.map((f) => (f.all ? 0 : named[next++]));
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

/** The window event that says the folders changed (R-Y164). */
export const FOLDERS_CHANGED = 'meta-sovereign:folders-changed';

export const announceFolders = () =>
  globalThis.dispatchEvent?.(new globalThis.Event(FOLDERS_CHANGED));
