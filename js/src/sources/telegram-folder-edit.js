/**
 * Creating, editing, deleting and ordering chat folders, as Telegram
 * Desktop's Settings → Folders and the folder tab's menu do (R-Y164;
 * learned, never copied). The folder is the page's shape (see
 * ./telegram-folders.js): `{ title, emoticon?, contacts, nonContacts,
 * groups, broadcasts, bots, excludeMuted, excludeRead, excludeArchived,
 * include, exclude, pinned }`, the lists being our chat ids.
 *
 * - `folderSave({ id?, folder })` — messages.updateDialogFilter with a
 *   DialogFilter (layer 225: the title is a TextWithEntities; a shared
 *   folder, `chatlist: true`, is a DialogFilterChatlist with chats only,
 *   R-Y172). With no `id` the folder is new and takes the next free id (Telegram wants the
 *   client to choose it, 2 or more);
 * - `folderDelete({ id })` — the same method with no filter;
 * - `foldersReorder({ order })` — messages.updateDialogFiltersOrder; the
 *   ids of every folder in the new order (0 is "All chats");
 * - `foldersSuggested()` — messages.getSuggestedDialogFilters, as
 *   `{ folder, description }` for the recommended folders.
 * Telegram's errors (too many folders, too many chats, ...) become codes
 * the page shows as words.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { folderOf } from './telegram-folders.js';

const CODES = {
  FILTER_INCLUDE_EMPTY: 'include-empty',
  FILTER_INCLUDE_TOO_MUCH: 'include-too-much',
  FILTER_TITLE_EMPTY: 'title-empty',
  FILTER_ID_INVALID: 'id-invalid',
  FILTER_NOT_SUPPORTED: 'not-supported',
  DIALOG_FILTERS_TOO_MUCH: 'too-many-folders',
  FILTERS_TOO_MUCH: 'too-many-folders',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  USER_PREMIUM_REQUIRED: 'premium',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };

/** Telegram's folder title limit, in letters. */
export const TITLE_MAX = 12;
export const CHATS_MAX = 200;
const CHAT = /^-?\d{1,20}$/;
const FLAGS = [
  'contacts',
  'nonContacts',
  'groups',
  'broadcasts',
  'bots',
  'excludeMuted',
  'excludeRead',
  'excludeArchived',
];

const chatList = (list) =>
  Array.isArray(list) &&
  list.length <= CHATS_MAX &&
  list.every((c) => typeof c === 'string' && CHAT.test(c)) &&
  new Set(list).size === list.length;

const flagOk = (folder, flag) =>
  folder[flag] === undefined || typeof folder[flag] === 'boolean';

// A shared folder (chat list) names its chats and nothing else.
const chatlistOk = (folder) =>
  ['chatlist', 'hasMyInvites'].every((flag) => flagOk(folder, flag)) &&
  (folder.chatlist !== true ||
    (FLAGS.every((flag) => folder[flag] !== true) &&
      (folder.exclude ?? []).length === 0));

/** Whether `folder` is a folder the page may send (strict). */
export const validFolder = (folder) => {
  if (!folder || typeof folder !== 'object' || Array.isArray(folder)) {
    return false;
  }
  const title = typeof folder.title === 'string' ? folder.title.trim() : '';
  return (
    title !== '' &&
    [...title].length <= TITLE_MAX &&
    (folder.emoticon === undefined ||
      folder.emoticon === null ||
      (typeof folder.emoticon === 'string' && folder.emoticon.length <= 16)) &&
    FLAGS.every((flag) => flagOk(folder, flag)) &&
    chatlistOk(folder) &&
    ['include', 'exclude', 'pinned'].every(
      (key) => folder[key] === undefined || chatList(folder[key])
    )
  );
};

/** A valid folder id: 2 and up (0 is "All chats", 1 the archive). */
export const validId = (id) => Number.isInteger(id) && id >= 2 && id < 1000;

// The input peer of a chat, whichever form the connection gives.
const inputOf = (env, c, chat) =>
  env.connection.withPeer(c.client, chat, async (peer) =>
    typeof peer === 'object' ? peer : await c.client.getInputEntity(peer)
  );

export const inputsOf = async (env, c, chats = []) => {
  const peers = [];
  for (const chat of chats) {
    peers.push(await inputOf(env, c, chat));
  }
  return peers;
};

// The DialogFilter for `folder` with the id given.
const filterOf = async (env, c, id, folder) => {
  const emoticon = folder.emoticon ? { emoticon: folder.emoticon } : {};
  const include = folder.include ?? [];
  const exclude = folder.exclude ?? [];
  const pinned = (folder.pinned ?? []).filter((x) => !exclude.includes(x));
  if (folder.chatlist === true) {
    // A shared folder takes chats by name only (layer 225: no flags).
    return new c.Api.DialogFilterChatlist({
      ...(folder.hasMyInvites ? { hasMyInvites: true } : {}),
      id,
      title: new c.Api.TextWithEntities({
        text: folder.title.trim(),
        entities: [],
      }),
      ...emoticon,
      pinnedPeers: await inputsOf(env, c, pinned),
      includePeers: await inputsOf(env, c, include),
    });
  }
  const flags = Object.fromEntries(
    FLAGS.filter((flag) => folder[flag] === true).map((flag) => [flag, true])
  );
  return new c.Api.DialogFilter({
    ...flags,
    id,
    title: new c.Api.TextWithEntities({
      text: folder.title.trim(),
      entities: [],
    }),
    ...emoticon,
    pinnedPeers: await inputsOf(env, c, pinned),
    includePeers: await inputsOf(env, c, include),
    excludePeers: await inputsOf(env, c, exclude),
  });
};

// The next free id: above every folder Telegram has.
const nextId = async (c) => {
  const answer = await c.client.invoke(new c.Api.messages.GetDialogFilters());
  const filters = Array.isArray(answer) ? answer : (answer?.filters ?? []);
  return Math.max(1, ...filters.map((f) => Number(f?.id) || 0)) + 1;
};

const suggestion = (s) => ({
  // Their chats are Telegram's examples: only the rules count.
  folder: { ...folderOf(s?.filter), include: [], exclude: [], pinned: [] },
  description: String(s?.description ?? ''),
});

export const createFolderEdit = (env, { userClient }) => {
  const edit = (use) =>
    connected(env, userClient, failure, (c) =>
      runIn(env, 'folders-edit', () => use(c))
    );
  return {
    /** `{ id?, folder }` → `{ ok, id }`. */
    folderSave: async ({ id, folder } = {}) => {
      if (!validFolder(folder) || (id !== undefined && !validId(id))) {
        return BAD;
      }
      return edit(async (c) => {
        const chosen = id ?? (await nextId(c));
        await c.client.invoke(
          new c.Api.messages.UpdateDialogFilter({
            id: chosen,
            filter: await filterOf(env, c, chosen, folder),
          })
        );
        return { ok: true, id: chosen };
      });
    },

    /** `{ id }` → `{ ok }`. */
    folderDelete: async ({ id } = {}) =>
      !validId(id)
        ? BAD
        : edit(async (c) => {
            await c.client.invoke(
              new c.Api.messages.UpdateDialogFilter({ id })
            );
            return { ok: true };
          }),

    /** `{ order }` (every folder id, 0 for "All chats") → `{ ok }`. */
    foldersReorder: async ({ order } = {}) => {
      const fine =
        Array.isArray(order) &&
        order.length > 0 &&
        order.length <= 100 &&
        order.every((n) => n === 0 || validId(n)) &&
        new Set(order).size === order.length;
      return !fine
        ? BAD
        : edit(async (c) => {
            await c.client.invoke(
              new c.Api.messages.UpdateDialogFiltersOrder({ order })
            );
            return { ok: true };
          });
    },

    /** `{}` → `{ ok, suggested: [{ folder, description }] }`. */
    foldersSuggested: async () =>
      connected(env, userClient, failure, async (c) => {
        const answer = await c.client.invoke(
          new c.Api.messages.GetSuggestedDialogFilters()
        );
        const suggested = (Array.isArray(answer) ? answer : [])
          .map(suggestion)
          .filter((s) => s.folder.title);
        return { ok: true, suggested };
      }),
  };
};
