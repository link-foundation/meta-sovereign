/**
 * Telegram's chat folders above the chat list (R-Y103; Telegram
 * Desktop's and Telegram for macOS's folder tabs, learned, never
 * copied). The folders come from the server (../sources/
 * telegram-folders.js); which chats are in one is decided here, from
 * the chat list, as Telegram's apps decide it:
 *
 * - a chat the folder excludes by name is never in it;
 * - one it includes or pins by name always is;
 * - otherwise its kind must be one the folder takes (contacts, other
 *   people, groups, channels, bots), and it must not be muted, read or
 *   archived when the folder leaves those out.
 *
 * A folder's pinned chats come first, in its own order. "All chats"
 * stands where Telegram puts it; with no folders the list keeps its own
 * tabs (all, private, groups, channels).
 */

import { useEffect, useMemo, useState } from 'react';
import { FOLDERS_CHANGED } from './chat-folder-model.js';
import { watchFolders } from './chat-folder-live.js';

const REFRESH_MS = 5 * 60_000;

export const isFolderFilter = (filter) => /^folder:\d+$/.test(String(filter));

export const folderKey = (folder) => `folder:${folder.id}`;

/** Each Telegram user's `contact` and `bot`, from their person links. */
export const peopleOf = (links = []) => {
  const people = new Map();
  for (const link of links) {
    const id = String(link?.id ?? '');
    if (id.startsWith('person:telegram:')) {
      people.set(id.slice('person:telegram:'.length), {
        contact: Boolean(link.contact),
        bot: Boolean(link.bot),
      });
    }
  }
  return people;
};

const takesKind = (folder, chat, people) => {
  if (chat.kind === 'group') {
    return folder.groups;
  }
  if (chat.kind === 'channel') {
    return folder.broadcasts;
  }
  const person = people.get(String(chat.chat));
  if (person?.bot) {
    return folder.bots;
  }
  return person?.contact ? folder.contacts : folder.nonContacts;
};

const leftOut = (folder, chat) =>
  (folder.excludeMuted && chat.muted) ||
  (folder.excludeRead && !(chat.unread > 0 || chat.marked)) ||
  (folder.excludeArchived && chat.archived);

/** `(chat) => boolean`: whether a chat is in `folder`. */
export const folderMatcher = (folder, people = new Map()) => {
  const never = new Set(folder.exclude ?? []);
  const always = new Set([...(folder.include ?? []), ...(folder.pinned ?? [])]);
  return (chat) => {
    if (chat?.source !== 'telegram') {
      return false;
    }
    const id = String(chat.chat);
    if (never.has(id)) {
      return false;
    }
    if (always.has(id)) {
      return true;
    }
    if (folder.chatlist) {
      return false;
    }
    return Boolean(takesKind(folder, chat, people)) && !leftOut(folder, chat);
  };
};

/**
 * The chats in `folder`, its pinned ones marked with their place in it
 * (and only those: the main list's pins are not the folder's).
 */
export const chatsInFolder = (chats = [], folder, people = new Map()) => {
  const inside = folderMatcher(folder, people);
  const rank = new Map((folder.pinned ?? []).map((id, i) => [id, i + 1]));
  return chats
    .filter(inside)
    .map((chat) => ({ ...chat, pinned: rank.get(String(chat.chat)) ?? 0 }));
};

/** Chats with something unread that is not muted, as the tab counts. */
export const unreadChats = (chats = []) =>
  chats.filter((c) => (c.unread > 0 || c.marked) && !c.muted).length;

/**
 * The tabs above the list: Telegram's folders in Telegram's order, "All
 * chats" where it stands — or, without folders, `fallback` (the list's
 * own tabs). Each `{ key, title?, label?, unread }`.
 */
export const folderTabs = (folders = [], { all = [], people, fallback }) => {
  const named = folders.filter((f) => !f.all);
  if (named.length === 0) {
    return fallback;
  }
  const order = folders.some((f) => f.all)
    ? folders
    : [{ id: 0, all: true }, ...folders];
  return order.map((folder) =>
    folder.all
      ? { key: 'all', label: 'chat.folder.all', unread: 0 }
      : {
          key: folderKey(folder),
          title: folder.title,
          unread: unreadChats(chatsInFolder(all, folder, people)),
        }
  );
};

/** Telegram's folders for a user account, asked now and then. */
export const useTelegramFolders = (api, telegram) => {
  const enabled =
    telegram?.kind === 'user' && typeof api?.telegramFolders === 'function';
  const [folders, setFolders] = useState([]);
  useEffect(() => {
    if (!enabled) {
      setFolders([]);
      return undefined;
    }
    let gone = false;
    const load = (event) =>
      api
        .telegramFolders(event?.type === FOLDERS_CHANGED ? { fresh: true } : {})
        .then(
          (answer) => {
            if (!gone && answer?.ok) {
              setFolders(Array.isArray(answer.folders) ? answer.folders : []);
            }
          },
          () => {}
        );
    load();
    const timer = globalThis.setInterval(load, REFRESH_MS);
    // Back to the window: changed in Telegram's settings meanwhile?
    globalThis.addEventListener?.('focus', load);
    // Changed by the page itself (R-Y164): asked again at once.
    globalThis.addEventListener?.(FOLDERS_CHANGED, load);
    // Changed on another device (R-Y172): asked again at once.
    const unwatch = watchFolders(api, () => load({ type: FOLDERS_CHANGED }));
    return () => {
      gone = true;
      unwatch();
      globalThis.clearInterval(timer);
      globalThis.removeEventListener?.('focus', load);
      globalThis.removeEventListener?.(FOLDERS_CHANGED, load);
    };
  }, [enabled, api]);
  return folders;
};

/**
 * What the folder tabs' menu needs (R-Y164): the api, the folders and the
 * Telegram chats to pick from; null when there are no folders to change.
 */
export const useFolderTools = (api, folders, all) =>
  useMemo(
    () =>
      folders.some((f) => !f.all) &&
      typeof api?.telegramFolderSave === 'function'
        ? {
            api,
            folders,
            chats: all
              .filter((c) => c.source === 'telegram')
              .map((c) => ({
                chat: String(c.chat),
                name: c.name ?? String(c.chat),
              })),
          }
        : null,
    [api, folders, all]
  );
