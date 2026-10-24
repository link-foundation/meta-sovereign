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
 *   ./telegram-emoji-status.js (R-Y162); the translate bar and summaries
 *   ./telegram-translate-chat.js (R-Y213).
 */

import { updatesOfResult, entitiesOf } from './telegram-catchup.js';
import { apiEntities, parseFormatted } from './telegram-format.js';
import { previewMedia, randomIdOf } from './telegram-send.js';
import { withSendAs } from './telegram-send-as-client.js';
import { createFileReader, createMediaReader } from './telegram-media.js';
import { createAvatarReader } from './telegram-avatars.js';
import { createChatInfoReader } from './telegram-chat-info.js';
import { createProxy } from './telegram-proxy.js';
import { createWallpapers } from './telegram-wallpapers.js';
import { createUnreadMarks } from './telegram-unread.js';
import { createPollActions } from './telegram-polls.js';
import { createDialogActions } from './telegram-dialogs.js';
import { createChatSearch } from './telegram-search.js';
import { createGlobalSearch } from './telegram-global.js';
import { createFileSender } from './telegram-upload.js';
import { createChatRemoval } from './telegram-chat-removal.js';
import { createChannelManage } from './telegram-channel-manage.js';
import { createScheduled } from './telegram-scheduled.js';
import { createFolders } from './telegram-folders.js';
import { createFolderEdit } from './telegram-folder-edit.js';
import { createChatlists } from './telegram-chatlists.js';
import { createStickers } from './telegram-stickers.js';
import { createStickerSets } from './telegram-sticker-sets.js';
import { createContactsEdit } from './telegram-contacts-edit.js';
import { createContactsActions } from './telegram-contacts.js';
import { createAccountsActions } from './telegram-accounts.js';
import { createChatThemes } from './telegram-chat-themes.js';
import { createCloudThemes } from './telegram-cloud-themes.js';
import { createUsernames } from './telegram-usernames.js';
import { createInvites } from './telegram-invite.js';
import { createMembers } from './telegram-members.js';
import { createModeration } from './telegram-moderation.js';
import { createOwnership } from './telegram-ownership.js';
import { createLeftChannels } from './telegram-left-channels.js';
import { createChatAdmins } from './telegram-chat-admins.js';
import { createPeerActions } from './telegram-peer-actions.js';
import { createVoiceChat } from './telegram-voice-chat.js';
import { createCustomEmoji } from './telegram-custom-emoji.js';
import { createEmojiKeywords } from './telegram-emoji-keywords.js';
import { createStickerTrending } from './telegram-sticker-trending.js';
import { createQuickReaction } from './telegram-quick-reaction.js';
import { createCustomEmojiSearch } from './telegram-custom-emoji-search.js';
import { createBotActions } from './telegram-bots.js';
import { createSharedMedia } from './telegram-shared.js';
import { createForum } from './telegram-forum.js';
import { createComments } from './telegram-comments.js';
import { createReadersActions } from './telegram-readers.js';
import { createMapActions } from './telegram-map.js';
import { createChatEdit } from './telegram-chat-edit.js';
import { createTranslate } from './telegram-translate.js';
import { createTranslateChat } from './telegram-translate-chat.js';
import { createTranscribe } from './telegram-transcribe.js';
import { createEphemeral } from './telegram-ephemeral.js';
import { createEffects } from './telegram-effects.js';
import { createEmojiStatus } from './telegram-emoji-status.js';
import { createMessageLinks } from './telegram-message-links.js';
import { createAdminActions } from './telegram-admin.js';
import { createChannelDm } from './telegram-channel-dm.js';
import { createCommonChats } from './telegram-common-chats.js';
import { createStats } from './telegram-stats.js';
import { createGifSave } from './telegram-gif-save.js';
import { createForumView } from './telegram-forum-view.js';
import { createPinnedList } from './telegram-pinned-list.js';
import { createSimilarChannels } from './telegram-similar-channels.js';
import { createFactChecks } from './telegram-fact-checks.js';
import { createViews } from './telegram-views.js';
import { createTopicAdmin } from './telegram-topic-admin.js';
import { createChatReactions } from './telegram-chat-reactions.js';
import { createChatSettings } from './telegram-chat-settings.js';
import { createGroupExtras } from './telegram-group-extras.js';
import { createEmojiGroups } from './telegram-emoji-groups.js';
import { createStorage } from './telegram-storage.js';
import { createNotifyExtras } from './telegram-notify-extras.js';
import { createNotifySettings } from './telegram-notify-settings.js';
import { createRingtones } from './telegram-ringtones.js';
import { createPinnedOrder } from './telegram-pinned-order.js';
import { createCalls } from './telegram-calls.js';
import { createPrivateCall } from './telegram-private-call.js';
import { createQuickReplies } from './telegram-quick-replies.js';
import { createBusinessMessages } from './telegram-business-messages.js';
import { createShareMedia } from './telegram-share-media.js';
import { createBotCommands } from './telegram-bot-commands.js';
import { createGames } from './telegram-games.js';
import { createRequestPeer } from './telegram-request-peer.js';
import { createWebApps } from './telegram-web-apps.js';
import { createBotLogin } from './telegram-bot-login.js';
import { createApps } from './telegram-apps.js';
import { createContactExtras } from './telegram-contact-extras.js';
import { createProfile } from './telegram-profile.js';
import { createPrivacy } from './telegram-privacy.js';
import { createSecurity } from './telegram-security.js';
import { createSecurityExtras } from './telegram-security-extras.js';
import { createInviteLinks } from './telegram-invite-links.js';
import { createTtl } from './telegram-ttl.js';
import { createAccountExtras } from './telegram-account-extras.js';
import { createSavedTags } from './telegram-saved-tags.js';
import { createBoosts } from './telegram-boosts.js';
import { createStars } from './telegram-stars.js';
import { createGiftSend } from './telegram-gift-send.js';
import { createGiftsManage } from './telegram-gifts-manage.js';
import { createProfileMusic } from './telegram-profile-music.js';
import { createProfileStories } from './telegram-profile-stories.js';
import { createPaidMessages } from './telegram-paid-messages.js';
import { createGiveaways } from './telegram-giveaways.js';
import { createProfileExtras } from './telegram-profile-extras.js';
import { createBusiness } from './telegram-business.js';
import { createBusinessLinks } from './telegram-business-links.js';
import { createBusinessBots } from './telegram-business-bots.js';
import { createSendAs } from './telegram-send-as.js';
import { createStories } from './telegram-stories.js';
import { createStoryActions } from './telegram-story-actions.js';
import { createStoryExtras } from './telegram-story-extras.js';
import { createStoryManage } from './telegram-story-manage.js';
import { createStoryPost } from './telegram-story-post.js';
import { createLinkPreview } from './telegram-link-preview.js';
import { createInstantView } from './telegram-instant-view.js';
import { createHistoryExport } from './telegram-export.js';
import { createAccountData } from './telegram-account-data.js';
import { createPhoneChange } from './telegram-phone-change.js';
import { createDrafts } from './telegram-drafts.js';
import { createCalendar } from './telegram-calendar.js';
import { createTopPeers } from './telegram-top-peers.js';
import { markDeleted as tombstone } from '../storage/soft-delete.js';

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
        await store.put(
          tombstone(link, { by: 'telegram', reason: 'deleted-on-network' })
        );
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
    // The Stars the user confirmed to forward into a paid chat (R-Y184).
    const sender = await withSendAs(env, client, null, flags.allowPaidStars);
    const result = await env.connection.withPeer(
      sender,
      String(toChat),
      async (toPeer) =>
        sender.invoke(
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
// and security (R-Y139, R-Y218); sharing a place and a contact (R-Y142);
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
// gifts, paid reactions and paid media (R-Y176); two-step verification, account
// self-destruct, sensitive content and per-session settings (R-Y177); a
// birthday, colours and a personal channel on profiles (R-Y178); Telegram
// Business quick replies, greeting and away messages (R-Y179); live view
// counters of channel posts and hashtag search (R-Y182); Telegram Business
// opening hours, location, intro, chat links, chatbots and folder tags
// (R-Y180); notification sounds (R-Y181); stories and music on profiles and
// sending a gift (R-Y185); exporting chat history (R-Y186); giveaways, paid
// messages and channel autotranslation (R-Y184); voice chats and group calls
// (R-Y188); the Contacts window and read times (R-Y189); bot games (R-Y190);
// interface scale and the connection proxy (R-Y192); channel direct messages
// and suggested posts (R-Y191); popular mini apps, similar bots, prepared
// messages and collectible usernames (R-Y194); managing received and unique
// gifts and gift codes (R-Y193); private one-to-one calls (R-Y196); more than
// one account (R-Y198); story stealth mode, reactions and reports (R-Y199); bot
// login links and attachment-menu bots (R-Y201); moderation, ownership
// transfer, broadcast groups and left channels (R-Y200); adding members,
// administrators and upgrading groups (R-Y204); request-peer buttons
// and recent locations (R-Y208); Instant View (R-Y205); trending
// stickers, the quick reaction and custom emoji search (R-Y206); cloud
// drafts, the calendar's day counts and frequent contacts (R-Y207);
// editing and linking one's stories (R-Y210); cloud themes and the
// per-chat translation switch (R-Y209); changing the phone number and
// exporting the account's data (R-Y212); a group's sticker set and emoji
// pack, pinned topics reordered, new chats in a shared folder and the
// new-contacts notification (R-Y211); ephemeral messages (R-Y223); deleted
// messages marked with the one tombstone shape (R-Z7); custom emoji in the
// composer and the emoji panel's category groups (R-Y214); the media
// cache's management, reaction notifications and resetting notifications
// (R-Y215); a channel's public link, look and deletion, and inactive
// channels to leave (R-Y216).
// pack, pinned topics reordered, new chats in a shared folder and the new-contacts notification (R-Y211); contact
// notes, share-my-contact links, phone links, photos for contacts, suggested
// birthdays, synced contacts and blocking from Replies (R-Y217).
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
  const { stickerLists, inlineOffer, ...stickers } = createStickers(
    env,
    context
  );
  return {
    ...createPollActions(env, context),
    ...createDialogActions(env, context),
    ...createChatSearch(env, context),
    ...createGlobalSearch(env, context),
    ...files,
    ...createChatRemoval(env, context),
    ...createChannelManage(env, context),
    ...createScheduled(env, context),
    ...createFolders(env, context),
    ...createFolderEdit(env, context),
    ...createChatlists(env, context),
    ...stickers,
    ...createStickerSets(env, { ...context, stickers: stickerLists }),
    ...createContactsEdit(env, context),
    ...createContactsActions(env, context),
    ...createAccountsActions(env, context),
    ...createChatThemes(env, context),
    ...createCloudThemes(env, context),
    ...createUsernames(env, context),
    ...createCustomEmoji(env, context),
    ...createEmojiKeywords(env, context),
    ...createStickerTrending(env, { ...context, stickers: stickerLists }),
    ...createQuickReaction(env, context),
    ...createCustomEmojiSearch(env, context),
    ...createBotActions(env, context),
    ...createSharedMedia(env, context),
    ...createForum(env, context),
    ...createInvites(env, context),
    ...createMembers(env, context),
    ...createModeration(env, context),
    ...createOwnership(env, context),
    ...createLeftChannels(env, context),
    ...createChatAdmins(env, context),
    ...createPeerActions(env, context),
    ...createVoiceChat(env, context),
    ...createComments(env, context),
    ...createReadersActions(env, context),
    ...createBotCommands(env, context),
    ...createGames(env, context),
    ...createRequestPeer(env, context),
    ...createWebApps(env, context),
    ...createBotLogin(env, context),
    ...createApps(env, { ...context, offer: inlineOffer }),
    ...createMapActions(env, context),
    ...createTranslate(env, context),
    ...createTranslateChat(env, context),
    ...createTranscribe(env, context),
    ...createEphemeral(env, context),
    ...createStories(env, context),
    ...createStoryActions(env, context),
    ...createStoryExtras(env, context),
    ...createStoryManage(env, context),
    ...createLinkPreview(env, context),
    ...createInstantView(env, context),
    ...createAdminActions(env, context),
    ...createCommonChats(env, context),
    ...createStats(env, context),
    ...createGifSave(env, { ...context, stickers: stickerLists }),
    ...createForumView(env, context),
    ...createPinnedList(env, context),
    ...createSimilarChannels(env, context),
    ...createFactChecks(env, context),
    ...createViews(env, context),
    ...createTopicAdmin(env, context),
    ...createChatReactions(env, context),
    ...createChatSettings(env, context),
    ...createWallpapers(env, context),
    ...createNotifySettings(env, context),
    ...createRingtones(env, withUploads),
    ...createPinnedOrder(env, context),
    ...createCalls(env, context),
    ...createPrivateCall(env, context),
    ...createQuickReplies(env, context),
    ...createBusinessMessages(env, context),
    ...createShareMedia(env, context),
    ...createChatEdit(env, withUploads),
    ...createProfile(env, withUploads),
    ...createContactExtras(env, withUploads),
    ...createStoryPost(env, withUploads),
    ...createPrivacy(env, context),
    ...createSecurity(env, context),
    ...createSecurityExtras(env, context),
    ...createTtl(env, context),
    ...createAccountExtras(env, context),
    ...createSavedTags(env, context),
    ...createBoosts(env, context),
    ...createStars(env, { ...context, stickers: stickerLists }),
    ...createGiftSend(env, { ...context, stickers: stickerLists }),
    ...createGiftsManage(env, { ...context, stickers: stickerLists }),
    ...createProfileStories(env, context),
    ...createProfileMusic(env, context),
    ...createPaidMessages(env, context),
    ...createGiveaways(env, context),
    ...createProfileExtras(env, context),
    ...createBusiness(env, { ...context, stickers: stickerLists }),
    ...createBusinessLinks(env, context),
    ...createBusinessBots(env, context),
    ...createSendAs(env, context),
    ...createEffects(env, context),
    ...createEmojiStatus(env, context),
    ...createInviteLinks(env, context),
    ...createMessageLinks(env, context),
    ...createHistoryExport(env, context),
    ...createAccountData(env, context),
    ...createPhoneChange(env, context),
    ...createProxy(env),
    ...createChannelDm(env, context),
    ...createDrafts(env, context),
    ...createCalendar(env, context),
    ...createTopPeers(env, context),
    ...createGroupExtras(env, context),
    ...createEmojiGroups(env, context),
    ...createStorage(env, context),
    ...createNotifyExtras(env, context),
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
