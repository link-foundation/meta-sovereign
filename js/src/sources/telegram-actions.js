/**
 * What the user does to messages in Chat, as Telegram's apps do it
 * (R-Y36): read some messages again, forward them, delete them, show
 * their pictures.
 *
 * - `refreshMessages({ chat, ids })` reads the messages by id (one
 *   request, by the stored peer, through the queue): an edit since is
 *   stored, and a message Telegram no longer has is marked `deleted` —
 *   so a deletion made in another app shows here even when no update
 *   about it arrived.
 * - `forwardMessages({ fromChat, ids, toChat })` and `deleteMessages({
 *   chat, ids, revoke })` change Telegram only on the user's press in
 *   Chat; Telegram's answer goes through the live handler at once (the
 *   forwarded messages appear, the deleted ones go) and moves the update
 *   counters, so the catch-up does not ask for them again.
 * - `pinMessage({ chat, id, unpin, oneSide, silent })` pins or unpins
 *   one message (R-Y67); Telegram's answer moves the pinned bar.
 * - `media({ chat, id, size })` is ./telegram-media.js.
 * - polls and checklists (vote, stop, results, voters, tick) are
 *   ./telegram-polls.js (R-Y74).
 * - the chat list's menu (pin, mute, archive, mark read or unread) is
 *   ./telegram-dialogs.js (R-Y97); search in a chat is
 *   ./telegram-search.js (R-Y98); files and photos are sent by
 *   ./telegram-upload.js (R-Y99); clearing, deleting and leaving a chat
 *   is ./telegram-chat-removal.js (R-Y100); scheduled messages are
 *   ./telegram-scheduled.js (R-Y102), chat folders ./telegram-folders.js
 *   (R-Y103); translating messages is ./telegram-translate.js (R-Y132);
 *   message effects are ./telegram-effects.js (R-Y149); emoji statuses
 *   ./telegram-emoji-status.js (R-Y162).
 */

import { updatesOfResult, entitiesOf } from './telegram-catchup.js';
import { apiEntities, parseFormatted } from './telegram-format.js';
import { previewMedia, randomIdOf } from './telegram-send.js';
import { createFileReader, createMediaReader } from './telegram-media.js';
import { createAvatarReader } from './telegram-avatars.js';
import { createChatInfoReader } from './telegram-chat-info.js';
import { createWallpapers } from './telegram-wallpapers.js';
import { createUnreadMarks } from './telegram-unread.js';
import { createPollActions } from './telegram-polls.js';
import { createDialogActions } from './telegram-dialogs.js';
import { createChatSearch } from './telegram-search.js';
import { createGlobalSearch } from './telegram-global.js';
import { createFileSender } from './telegram-upload.js';
import { createChatRemoval } from './telegram-chat-removal.js';
import { createScheduled } from './telegram-scheduled.js';
import { createFolders } from './telegram-folders.js';
import { createFolderEdit } from './telegram-folder-edit.js';
import { createChatlists } from './telegram-chatlists.js';
import { createStickers } from './telegram-stickers.js';
import { createStickerSets } from './telegram-sticker-sets.js';
import { createContactsEdit } from './telegram-contacts-edit.js';
import { createChatThemes } from './telegram-chat-themes.js';
import { createUsernames } from './telegram-usernames.js';
import { createInvites } from './telegram-invite.js';
import { createMembers } from './telegram-members.js';
import { createPeerActions } from './telegram-peer-actions.js';
import { createCustomEmoji } from './telegram-custom-emoji.js';
import { createEmojiKeywords } from './telegram-emoji-keywords.js';
import { createBotActions } from './telegram-bots.js';
import { createSharedMedia } from './telegram-shared.js';
import { createForum } from './telegram-forum.js';
import { createComments } from './telegram-comments.js';
import { createReadersActions } from './telegram-readers.js';
import { createMapActions } from './telegram-map.js';
import { createChatEdit } from './telegram-chat-edit.js';
import { createTranslate } from './telegram-translate.js';
import { createTranscribe } from './telegram-transcribe.js';
import { createEffects } from './telegram-effects.js';
import { createEmojiStatus } from './telegram-emoji-status.js';
import { createMessageLinks } from './telegram-message-links.js';
import { createAdminActions } from './telegram-admin.js';
import { createCommonChats } from './telegram-common-chats.js';
import { createStats } from './telegram-stats.js';
import { createGifSave } from './telegram-gif-save.js';
import { createForumView } from './telegram-forum-view.js';
import { createPinnedList } from './telegram-pinned-list.js';
import { createSimilarChannels } from './telegram-similar-channels.js';
import { createFactChecks } from './telegram-fact-checks.js';
import { createTopicAdmin } from './telegram-topic-admin.js';
import { createChatReactions } from './telegram-chat-reactions.js';
import { createChatSettings } from './telegram-chat-settings.js';
import { createNotifySettings } from './telegram-notify-settings.js';
import { createPinnedOrder } from './telegram-pinned-order.js';
import { createCalls } from './telegram-calls.js';
import { createShareMedia } from './telegram-share-media.js';
import { createBotCommands } from './telegram-bot-commands.js';
import { createWebApps } from './telegram-web-apps.js';
import { createProfile } from './telegram-profile.js';
import { createPrivacy } from './telegram-privacy.js';
import { createInviteLinks } from './telegram-invite-links.js';
import { createTtl } from './telegram-ttl.js';
import { createAccountExtras } from './telegram-account-extras.js';
import { createSavedTags } from './telegram-saved-tags.js';
import { createBoosts } from './telegram-boosts.js';
import { createStars } from './telegram-stars.js';
import { createSendAs } from './telegram-send-as.js';
import { createStories } from './telegram-stories.js';
import { createStoryActions } from './telegram-story-actions.js';
import { createStoryPost } from './telegram-story-post.js';
import { createLinkPreview } from './telegram-link-preview.js';

const SOURCE = 'telegram';
const MAX_IDS = 100;

const isChannel = (chat) => String(chat).startsWith('-100');

// Edit an existing message in-place. A channel uses the channels API;
// plain chats and groups use messages.EditMessage (R-Y36).
const makeEditMessage =
  (env, userClient, apply) =>
  async ({ chat, id, text, link, ...preview } = {}) => {
    const wanted = [Number(id ?? link?.id?.split(':').pop())].filter(
      (n) => n > 0
    );
    const client =
      wanted.length > 0 && (chat || link?.chat) ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat ?? link?.chat);
    const msgId = wanted[0];
    // One method for every chat, channels too (there is no
    // channels.editMessage in Telegram's API).
    // Formatted as a new message is (R-Y101).
    const formatted = parseFormatted(text);
    const entities = apiEntities(Api, formatted.entities);
    const page = Api.InputMediaWebPage ? previewMedia(Api, preview) : null;
    const result = await env.connection.withPeer(client, target, (peer) =>
      client.invoke(
        new Api.messages.EditMessage({
          peer,
          id: msgId,
          message: formatted.text,
          ...(entities.length > 0 ? { entities } : {}),
          // The link preview dropped or put above the text (R-Y145).
          ...(preview.noWebpage === true ? { noWebpage: true } : {}),
          ...(preview.invertMedia === true ? { invertMedia: true } : {}),
          // A sized preview: the page as the message's media (R-Y146).
          ...(page ? { media: page } : {}),
        })
      )
    );
    await apply(client, result);
    return { ok: true, edited: msgId };
  };

// Add or remove a reaction emoji on a message. Pass no `emoji` to clear
// the reaction (R-Y36).
const makeReact =
  (env, userClient, apply) =>
  async ({ chat, id, emoji, link } = {}) => {
    const msgId = Number(id ?? link?.id?.split(':').pop());
    const client =
      msgId > 0 && (chat || link?.chat) ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat ?? link?.chat);
    const reaction = emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [];
    const result = await env.connection.withPeer(client, target, (peer) =>
      client.invoke(new Api.messages.SendReaction({ peer, msgId, reaction }))
    );
    await apply(client, result);
    return { ok: true, reacted: msgId };
  };

// Pin or unpin a message (R-Y67). As in Telegram's apps, a pin is for
// both sides and notifies unless `oneSide` (a private chat: pin for me
// only) or `silent` says otherwise.
const makePin =
  (env, userClient, apply) =>
  async ({ chat, id, unpin = false, oneSide = false, silent = false } = {}) => {
    const msgId = Number(id);
    const client =
      Number.isInteger(msgId) && msgId > 0 && chat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const result = await env.connection.withPeer(client, String(chat), (peer) =>
      client.invoke(
        new Api.messages.UpdatePinnedMessage({
          peer,
          id: msgId,
          unpin: Boolean(unpin),
          pmOneside: Boolean(oneSide),
          silent: Boolean(silent),
        })
      )
    );
    await apply(client, result);
    return { ok: true, pinned: unpin ? null : msgId };
  };

const cleanIds = (ids) =>
  [...new Set((ids ?? []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_IDS);

/**
 * `env` is the account's (store, connection, queue, peers, live,
 * catchUp, channels, importer); `tools` brings `credentials()`,
 * `toLinks(dialog, messages)` and `writeChanged(store, links)`.
 */
// The @ and ♥ buttons' messages (R-Y55), stored as they come.
const markReaders = (env, tools, userClient, dialogOf) => {
  const unread = createUnreadMarks(env, {
    userClient,
    write: async (chat, messages) =>
      tools.writeChanged(
        env.store,
        tools.toLinks(await dialogOf(chat), messages)
      ),
  });
  return { unreadMarks: unread.marks, readMarks: unread.readMarks };
};

// The forward request. The options Telegram takes are set only when exactly
// true (R-Y154): `dropAuthor` hides the sender's name, `dropMediaCaptions`
// the captions.
const forwardRequest = ({ Api, helpers }, { fromPeer, toPeer, ids }, flags) =>
  new Api.messages.ForwardMessages({
    fromPeer,
    toPeer,
    id: ids,
    randomId: ids.map((_, i) => randomIdOf(null, i, helpers)),
    ...(flags.dropAuthor === true ? { dropAuthor: true } : {}),
    ...(flags.dropMediaCaptions === true ? { dropMediaCaptions: true } : {}),
  });

export const createActions = (env, tools, { mediaDir = null } = {}) => {
  const { store } = env;

  // The connected user client and the chat's peer, else null.
  const userClient = async () => {
    const creds = await tools.credentials();
    return creds?.kind === 'user'
      ? (await env.connection.open(creds)).client
      : null;
  };

  const dialogOf = async (chat) =>
    env.live.chats?.get(chat) ?? (await env.peers.dialog(chat)) ?? { id: chat };

  // Telegram's answer to a change we asked for: its messages through the
  // live handler, then the update counters.
  const apply = async (client, result) => {
    const entities = entitiesOf(result ?? {});
    for (const update of updatesOfResult(result)) {
      if (update && typeof update === 'object') {
        update._entities = entities;
        await env.live.handle(client, update);
        await env.channels?.observe(update);
      }
    }
    env.catchUp?.observeResult(result);
  };

  const markDeleted = async (chat, ids) => {
    let marked = 0;
    for (const id of ids) {
      const link = await store.get(`msg:${SOURCE}:${chat}:${id}`);
      if (link && !link.deleted) {
        await store.put({ ...link, deleted: true });
        marked += 1;
      }
    }
    return marked;
  };

  const refreshMessages = async ({ chat, ids, priority = 'list' } = {}) => {
    const wanted = cleanIds(ids);
    const client = wanted.length > 0 && chat ? await userClient() : null;
    if (!client) {
      return { written: 0, deleted: 0 };
    }
    const target = String(chat);
    const got = await env.queue.run(
      `refresh:${target}:${wanted.join(',')}`,
      priority,
      () =>
        env.connection.withPeer(client, target, (peer) =>
          client.getMessages(peer, { ids: wanted })
        )
    );
    const list = [...(got ?? [])];
    const present = list.filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    const written = await tools.writeChanged(
      store,
      tools.toLinks(await dialogOf(target), present)
    );
    const kept = new Set(present.map((m) => Number(m.id)));
    const deleted = await markDeleted(
      target,
      wanted.filter((id) => !kept.has(id))
    );
    return { written, deleted };
  };

  const forwardMessages = async ({ fromChat, ids, toChat, ...flags } = {}) => {
    const wanted = cleanIds(ids);
    const client =
      wanted.length > 0 && fromChat && toChat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const imports = await env.importer();
    const fromPeer = (await env.peers.input(String(fromChat))) ?? fromChat;
    const result = await env.connection.withPeer(
      client,
      String(toChat),
      async (toPeer) =>
        client.invoke(
          forwardRequest(imports, { fromPeer, toPeer, ids: wanted }, flags)
        )
    );
    await apply(client, result);
    return { ok: true, forwarded: wanted.length };
  };

  const deleteMessages = async ({ chat, ids, revoke = false } = {}) => {
    const wanted = cleanIds(ids);
    const client = wanted.length > 0 && chat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const affected = await env.connection.withPeer(client, target, (peer) =>
      client.invoke(
        isChannel(target)
          ? new Api.channels.DeleteMessages({ channel: peer, id: wanted })
          : new Api.messages.DeleteMessages({ id: wanted, revoke })
      )
    );
    // Telegram answers with the counter it moved; the deletion itself is
    // the update it stands for.
    if (isChannel(target)) {
      await apply(client, {
        className: 'UpdateDeleteChannelMessages',
        channelId: target.slice(4),
        messages: wanted,
        pts: affected?.pts,
        ptsCount: affected?.ptsCount,
      });
    } else {
      await markDeleted(target, wanted);
      env.catchUp?.observeResult({
        className: 'UpdateDeleteMessages',
        messages: wanted,
        pts: affected?.pts,
        ptsCount: affected?.ptsCount,
      });
    }
    return { ok: true, deleted: wanted.length };
  };

  const editMessage = makeEditMessage(env, userClient, apply);
  const react = makeReact(env, userClient, apply);
  const pinMessage = makePin(env, userClient, apply);

  const reader = mediaDir
    ? createMediaReader({
        store,
        dir: mediaDir,
        queue: env.queue,
        client: userClient,
        refresh: refreshMessages,
        importer: env.importer,
        log: env.log,
      })
    : null;

  const media = async (request) => (reader ? reader.read(request) : null);
  const readers = mediaReaders(env, { mediaDir, userClient, refreshMessages });

  return {
    refreshMessages,
    forwardMessages,
    deleteMessages,
    editMessage,
    react,
    pinMessage,
    media,
    ...markReaders(env, tools, userClient, dialogOf),
    ...readers,
    ...chatActions(env, { userClient, apply, dialogOf, tools, mediaDir }),
  };
};

// Polls and checklists (R-Y74); the chat list's menu (R-Y97); search
// in a chat (R-Y98) and across Telegram (R-Y107); files and photos (R-Y99); clear, delete, leave
// (R-Y100); scheduled messages (R-Y102); folders (R-Y103); stickers and
// saved GIFs (R-Y105); bots' buttons (R-Y110); shared media (R-Y111);
// forum topics (R-Y122), created, edited, pinned, closed and deleted (R-Y153); invite links (R-Y123); members (R-Y125);
// comments (R-Y126); who read and who reacted (R-Y127); block, contacts
// and report (R-Y128); new groups and channels, a chat's info edited (R-Y129);
// map pictures of places (R-Y131); translation (R-Y132); a group's
// permissions, slow mode and recent actions (R-Y133); a bot's commands
// (R-Y135); the user's own profile (R-Y136); inline bots (R-Y138, made by
// the stickers' module, which keeps the files their answers name); privacy
// and security (R-Y139); sharing a place and a contact (R-Y142);
// auto-delete timers and Saved Messages by chat (R-Y143); "send as"
// (R-Y141); viewing stories (R-Y140); the message box's link preview
// (R-Y145); story replies, reactions, viewers, deleting and hiding
// (R-Y148); reaction tags of Saved Messages and the default timer (R-Y151);
// invite links and join requests (R-Y152); posting stories (R-Y156); links
// to messages (R-Y154); chat backgrounds (R-Y155); notification settings,
// global and by chat (R-Y157); groups in common (R-Y158); which reactions a
// chat allows (R-Y160); reordering the pinned chats (R-Y159); the recent
// calls list (R-Y163); emoji statuses (R-Y162); a group's and channel's
// settings, the discussion group included (R-Y165); creating and editing chat
// folders (R-Y164); statistics of channels and supergroups (R-Y167); the pinned
// messages list, similar channels and fact checks (R-Y166); bot mini apps
// (R-Y168); sticker and emoji sets, close friends and adding a contact by phone
// (R-Y169); channel boosts (R-Y173); chat themes and several usernames
// (R-Y170); saving a chat's GIF and viewing a forum as messages (R-Y171);
// archive settings, logged-in websites and pinned Saved Messages chats
// (R-Y174); live folders, drag to reorder and shared folders (R-Y172); voice
// and video note transcription (R-Y175); Telegram Stars: balance, history,
// gifts, paid reactions and paid media (R-Y176).
const chatActions = (env, context) => {
  const { held, ...files } = createFileSender(env, context);
  const { uploads, drop } = held;
  // The page's uploads, for actions that send one themselves.
  const withUploads = {
    ...context,
    uploads: {
      uploadOf: (token) => uploads.get(token) ?? null,
      dropUpload: drop,
    },
  };
  const { stickerLists, ...stickers } = createStickers(env, context);
  return {
    ...createPollActions(env, context),
    ...createDialogActions(env, context),
    ...createChatSearch(env, context),
    ...createGlobalSearch(env, context),
    ...files,
    ...createChatRemoval(env, context),
    ...createScheduled(env, context),
    ...createFolders(env, context),
    ...createFolderEdit(env, context),
    ...createChatlists(env, context),
    ...stickers,
    ...createStickerSets(env, { ...context, stickers: stickerLists }),
    ...createContactsEdit(env, context),
    ...createChatThemes(env, context),
    ...createUsernames(env, context),
    ...createCustomEmoji(env, context),
    ...createEmojiKeywords(env, context),
    ...createBotActions(env, context),
    ...createSharedMedia(env, context),
    ...createForum(env, context),
    ...createInvites(env, context),
    ...createMembers(env, context),
    ...createPeerActions(env, context),
    ...createComments(env, context),
    ...createReadersActions(env, context),
    ...createBotCommands(env, context),
    ...createWebApps(env, context),
    ...createMapActions(env, context),
    ...createTranslate(env, context),
    ...createTranscribe(env, context),
    ...createStories(env, context),
    ...createStoryActions(env, context),
    ...createLinkPreview(env, context),
    ...createAdminActions(env, context),
    ...createCommonChats(env, context),
    ...createStats(env, context),
    ...createGifSave(env, { ...context, stickers: stickerLists }),
    ...createForumView(env, context),
    ...createPinnedList(env, context),
    ...createSimilarChannels(env, context),
    ...createFactChecks(env, context),
    ...createTopicAdmin(env, context),
    ...createChatReactions(env, context),
    ...createChatSettings(env, context),
    ...createWallpapers(env, context),
    ...createNotifySettings(env, context),
    ...createPinnedOrder(env, context),
    ...createCalls(env, context),
    ...createShareMedia(env, context),
    ...createChatEdit(env, withUploads),
    ...createProfile(env, withUploads),
    ...createStoryPost(env, withUploads),
    ...createPrivacy(env, context),
    ...createTtl(env, context),
    ...createAccountExtras(env, context),
    ...createSavedTags(env, context),
    ...createBoosts(env, context),
    ...createStars(env, { ...context, stickers: stickerLists }),
    ...createSendAs(env, context),
    ...createEffects(env, context),
    ...createEmojiStatus(env, context),
    ...createInviteLinks(env, context),
    ...createMessageLinks(env, context),
  };
};

// A message's file (video, voice, GIF, sticker), a peer's photo and a
// chat's members and who is online, each read through the queue.
const mediaReaders = (env, { mediaDir, userClient, refreshMessages }) => {
  const shared = {
    queue: env.queue,
    client: userClient,
    importer: env.importer,
    log: env.log,
  };
  const files = mediaDir
    ? createFileReader({
        ...shared,
        store: env.store,
        dir: mediaDir,
        refresh: refreshMessages,
      })
    : null;
  const avatars = mediaDir
    ? createAvatarReader({ ...shared, dir: mediaDir, peers: env.peers })
    : null;
  const info = createChatInfoReader({ ...shared, peers: env.peers });
  return {
    file: async (request) => (files ? files.read(request) : null),
    avatar: async (request) => (avatars ? avatars.read(request) : null),
    chatInfo: (request) => info.read(request),
  };
};
