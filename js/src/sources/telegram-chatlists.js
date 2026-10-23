/**
 * Shared folders (chat lists), as Telegram Desktop has them (R-Y172;
 * learned, never copied): a folder whose chats others can add through a
 * `t.me/addlist/<slug>` link.
 *
 * - `chatlistInvites({ id })` — chatlists.getExportedInvites: the folder's
 *   links, `{ slug, title, url, chats: [chat] }`, and the names of the chats;
 * - `chatlistExport({ id, title?, chats })` — chatlists.exportChatlistInvite
 *   with the chats chosen from the folder's groups and channels; the folder
 *   becomes a shared one (`folderId` says which);
 * - `chatlistInviteEdit({ id, slug, title?, chats? })` —
 *   chatlists.editExportedInvite; `chatlistInviteDelete({ id, slug })` —
 *   chatlists.deleteExportedInvite;
 * - `chatlistCheck({ slug })` — chatlists.checkChatlistInvite, only a look:
 *   `{ ok, already, folderId?, title, emoticon, chats: [{ chat, name, kind,
 *   joined }] }` (`joined`: the user is in it; for a folder the user has,
 *   the chats not yet in are the new ones);
 * - `chatlistJoin({ slug, chats })` — only on the user's press:
 *   chatlists.joinChatlistInvite for a new folder, chatlists.
 *   joinChatlistUpdates for one the user already has; only chats the link
 *   names can be chosen;
 * - `chatlistLeaveSuggestions({ id })` — chatlists.getLeaveChatlistSuggestions:
 *   the chats it would be good to leave as well;
 *   `chatlistLeave({ id, chats })` — chatlists.leaveChatlist.
 * Telegram's errors become codes the page shows as words.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { inputsOf } from './telegram-folder-edit.js';
import { markedId } from './telegram-invite.js';

const CODES = {
  CHATLIST_EXCLUDE_INVALID: 'bad-chats',
  INVITES_TOO_MUCH: 'too-many-links',
  CHATLISTS_TOO_MUCH: 'too-many-shared',
  FILTER_ID_INVALID: 'id-invalid',
  FILTER_INCLUDE_EMPTY: 'include-empty',
  FILTER_NOT_SUPPORTED: 'not-supported',
  PEERS_LIST_EMPTY: 'no-chats',
  INVITE_SLUG_EXPIRED: 'invite-expired',
  INVITE_SLUG_INVALID: 'invite-invalid',
  INVITE_SLUG_EMPTY: 'invite-invalid',
  USER_CHANNELS_TOO_MUCH: 'too-many-chats',
  CHANNELS_TOO_MUCH: 'too-many-chats',
  DIALOG_FILTERS_TOO_MUCH: 'too-many-folders',
  USER_ALREADY_PARTICIPANT: 'already-member',
  CHAT_ADMIN_REQUIRED: 'not-admin',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  USER_PREMIUM_REQUIRED: 'premium',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };

export const SLUG = /^[A-Za-z0-9_-]{8,64}$/;
const GROUP_CHAT = /^-\d{1,20}$/;
const LINK_TITLE_MAX = 32;
const CHATS_MAX = 200;

/** Whether `chats` is a list of group or channel ids (strict). */
export const validChats = (chats, { min = 0 } = {}) =>
  Array.isArray(chats) &&
  chats.length >= min &&
  chats.length <= CHATS_MAX &&
  chats.every((c) => typeof c === 'string' && GROUP_CHAT.test(c)) &&
  new Set(chats).size === chats.length;

/** Whether `title` is a link's name (up to 32 letters, may be empty). */
export const validLinkTitle = (title) =>
  title === undefined ||
  (typeof title === 'string' && [...title].length <= LINK_TITLE_MAX);

/** A folder id the page may name (2 and up). */
export const validFolderId = (id) =>
  Number.isInteger(id) && id >= 2 && id < 1000;

/** The slug a `t.me/addlist/<slug>` link carries, or null. */
export const slugOfUrl = (url) =>
  /\/addlist\/([A-Za-z0-9_-]+)\/?$/.exec(String(url ?? ''))?.[1] ?? null;

const text = (value) => String(value?.value ?? value);

// Every chat and user an answer names: marked id -> { name, kind, entity }.
const entitiesOf = (answer) => {
  const found = new Map();
  for (const chat of answer?.chats ?? []) {
    found.set(markedId(chat), {
      name: chat.title ?? '',
      kind: chat.broadcast ? 'channel' : 'group',
      entity: chat,
    });
  }
  for (const user of answer?.users ?? []) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    found.set(text(user.id), {
      name: name || user.username || text(user.id),
      kind: 'user',
      entity: user,
    });
  }
  return found;
};

// A Peer (not an InputPeer) as our chat id.
const peerIdOf = (peer) => {
  if (peer?.userId !== undefined) {
    return text(peer.userId);
  }
  if (peer?.chatId !== undefined) {
    return `-${text(peer.chatId)}`;
  }
  return peer?.channelId === undefined ? null : `-100${text(peer.channelId)}`;
};

const peerIds = (peers) => (peers ?? []).map(peerIdOf).filter(Boolean);

const namesOf = (entities, ids) =>
  [...new Set(ids)].map((chat) => ({
    chat,
    name: entities.get(chat)?.name || chat,
  }));

const linkOf = (invite) => ({
  slug: slugOfUrl(invite?.url),
  title: String(invite?.title ?? ''),
  url: String(invite?.url ?? ''),
  chats: peerIds(invite?.peers),
});

// The input peer of a chat in a link's answer, which the user may not be in.
const inputFromEntity = (c, entity) => {
  switch (entity.className) {
    case 'Channel':
    case 'ChannelForbidden':
      return new c.Api.InputPeerChannel({
        channelId: entity.id,
        accessHash: entity.accessHash,
      });
    case 'Chat':
    case 'ChatForbidden':
      return new c.Api.InputPeerChat({ chatId: entity.id });
    case 'User':
      return new c.Api.InputPeerUser({
        userId: entity.id,
        accessHash: entity.accessHash,
      });
    default:
      return null;
  }
};

const folderRef = (c, id) =>
  new c.Api.InputChatlistDialogFilter({ filterId: id });

// What a check of a link says, for the page.
const describeCheck = (answer) => {
  const entities = entitiesOf(answer);
  if (/ChatlistInviteAlready$/.test(answer.className ?? '')) {
    const missing = peerIds(answer.missingPeers);
    const already = peerIds(answer.alreadyPeers);
    return {
      entities,
      view: {
        ok: true,
        already: true,
        folderId: Number(answer.filterId),
        title: '',
        emoticon: null,
        chats: [
          ...missing.map((chat) => ({ chat, joined: false })),
          ...already.map((chat) => ({ chat, joined: true })),
        ].map((row) => ({
          ...row,
          name: entities.get(row.chat)?.name || row.chat,
          kind: entities.get(row.chat)?.kind ?? 'group',
        })),
      },
    };
  }
  return {
    entities,
    view: {
      ok: true,
      already: false,
      title: text(answer.title?.text ?? answer.title ?? ''),
      emoticon: answer.emoticon ?? null,
      chats: peerIds(answer.peers).map((chat) => ({
        chat,
        name: entities.get(chat)?.name || chat,
        kind: entities.get(chat)?.kind ?? 'group',
        joined: false,
      })),
    },
  };
};

// The folder's own links: listed, made, edited, deleted.
const createLinkActions = (env, inFolder) => ({
  /** `{ id }` → `{ ok, invites, chats }`. */
  chatlistInvites: async ({ id } = {}) =>
    !validFolderId(id)
      ? BAD
      : inFolder(async (c) => {
          const answer = await c.client.invoke(
            new c.Api.chatlists.GetExportedInvites({
              chatlist: folderRef(c, id),
            })
          );
          const invites = (answer?.invites ?? []).map(linkOf);
          const entities = entitiesOf(answer);
          return {
            ok: true,
            invites: invites.filter((i) => i.slug),
            chats: namesOf(
              entities,
              invites.flatMap((i) => i.chats)
            ),
          };
        }),

  /** `{ id, title?, chats }` → `{ ok, invite }`. */
  chatlistExport: async ({ id, title, chats } = {}) =>
    !validFolderId(id) ||
    !validLinkTitle(title) ||
    !validChats(chats, { min: 1 })
      ? BAD
      : inFolder(async (c) => {
          const answer = await c.client.invoke(
            new c.Api.chatlists.ExportChatlistInvite({
              chatlist: folderRef(c, id),
              title: title ?? '',
              peers: await inputsOf(env, c, chats),
            })
          );
          const invite = linkOf(answer?.invite);
          return invite.slug
            ? { ok: true, invite, folderId: id }
            : { ok: false, error: 'failed', code: 'failed' };
        }),

  /** `{ id, slug, title?, chats? }` → `{ ok, invite }`. */
  chatlistInviteEdit: async ({ id, slug, title, chats } = {}) =>
    !validFolderId(id) ||
    !SLUG.test(String(slug)) ||
    !validLinkTitle(title) ||
    (chats !== undefined && !validChats(chats, { min: 1 })) ||
    (title === undefined && chats === undefined)
      ? BAD
      : inFolder(async (c) => {
          const answer = await c.client.invoke(
            new c.Api.chatlists.EditExportedInvite({
              chatlist: folderRef(c, id),
              slug,
              ...(title === undefined ? {} : { title }),
              ...(chats === undefined
                ? {}
                : { peers: await inputsOf(env, c, chats) }),
            })
          );
          return { ok: true, invite: { ...linkOf(answer), slug } };
        }),

  /** `{ id, slug }` → `{ ok }`. */
  chatlistInviteDelete: async ({ id, slug } = {}) =>
    !validFolderId(id) || !SLUG.test(String(slug))
      ? BAD
      : inFolder(async (c) => {
          await c.client.invoke(
            new c.Api.chatlists.DeleteExportedInvite({
              chatlist: folderRef(c, id),
              slug,
            })
          );
          return { ok: true };
        }),
});

export const createChatlists = (env, { userClient, apply }) => {
  const asUser = (use) => connected(env, userClient, failure, use);
  const seen = new Map(); // slug -> { already, folderId, inputs: Map }

  const look = async (c, slug) => {
    const answer = await runIn(env, `chatlist:check:${slug}`, () =>
      c.client.invoke(new c.Api.chatlists.CheckChatlistInvite({ slug }))
    );
    const { entities, view } = describeCheck(answer ?? {});
    const inputs = new Map(
      view.chats.map((row) => [
        row.chat,
        inputFromEntity(c, entities.get(row.chat)?.entity ?? {}),
      ])
    );
    seen.set(slug, { already: view.already, folderId: view.folderId, inputs });
    return view;
  };

  const inFolder = (use) => asUser((c) => runIn(env, 'chatlist', () => use(c)));

  return {
    ...createLinkActions(env, inFolder),
    /** `{ slug }` → what the link leads to; nothing is joined. */
    chatlistCheck: async ({ slug } = {}) =>
      !SLUG.test(String(slug))
        ? { ok: false, error: 'invite-invalid', code: 'invite-invalid' }
        : asUser((c) => look(c, slug)),

    /** `{ slug, chats }` → `{ ok }`; only on the user's press. */
    chatlistJoin: async ({ slug, chats } = {}) =>
      !SLUG.test(String(slug)) || !validChats(chats, { min: 1 })
        ? BAD
        : asUser(async (c) => {
            if (!seen.has(slug)) {
              await look(c, slug);
            }
            const known = seen.get(slug);
            const peers = chats.map((chat) => known.inputs.get(chat));
            if (peers.some((peer) => !peer)) {
              return { ok: false, error: 'not in the link', code: 'bad-chats' };
            }
            const result = await runIn(env, `chatlist:join:${slug}`, () =>
              c.client.invoke(
                known.already
                  ? new c.Api.chatlists.JoinChatlistUpdates({
                      chatlist: folderRef(c, known.folderId),
                      peers,
                    })
                  : new c.Api.chatlists.JoinChatlistInvite({ slug, peers })
              )
            );
            seen.delete(slug);
            if (result && typeof result === 'object') {
              await apply?.(c.client, result);
            }
            return { ok: true };
          }),

    /** `{ id }` → `{ ok, chats }` the chats suggested to leave too. */
    chatlistLeaveSuggestions: async ({ id } = {}) =>
      !validFolderId(id)
        ? BAD
        : inFolder(async (c) => {
            const peers = await c.client.invoke(
              new c.Api.chatlists.GetLeaveChatlistSuggestions({
                chatlist: folderRef(c, id),
              })
            );
            return {
              ok: true,
              chats: peerIds(Array.isArray(peers) ? peers : []),
            };
          }),

    /** `{ id, chats }` → `{ ok }`: the folder left, with these chats. */
    chatlistLeave: async ({ id, chats } = {}) =>
      !validFolderId(id) || !validChats(chats)
        ? BAD
        : inFolder(async (c) => {
            const result = await c.client.invoke(
              new c.Api.chatlists.LeaveChatlist({
                chatlist: folderRef(c, id),
                peers: await inputsOf(env, c, chats),
              })
            );
            if (result && typeof result === 'object') {
              await apply?.(c.client, result);
            }
            return { ok: true };
          }),
  };
};
