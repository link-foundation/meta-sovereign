// The page's Telegram calls that are a plain POST to /api/telegram/<route>,
// spread into `api` by ./dom.js (moved out of it for its size): `body`
// passes the caller's body on, `none` always sends {}. The comments name
// what each group is for and its requirement.

const body = (route) => ({ route, body: true });
const none = (route) => ({ route, body: false });

export const TELEGRAM_CALLS = {
  // Checklists (new, "Add tasks"), a reaction reported, a post's
  // statistics and public shares, Stars revenue (R-Y195).
  telegramSendTodo: body('send-todo'),
  telegramAppendTodo: body('todo-append'),
  telegramReportReaction: body('reaction-report'),
  telegramMessageStats: body('message-stats'),
  telegramPublicForwards: body('public-forwards'),
  telegramStarsRevenue: body('stars-revenue'),
  // More than one account (R-Y198): the signed-in accounts, the other
  // accounts' unread counts ({ all } adds account 1's, R-Y202), one extra account's chat list ({ account })
  // and logging an extra account out ({ account }).
  telegramAccounts: none('accounts'),
  telegramAccountsUnread: body('accounts-unread'),
  telegramAccountsDialogs: body('accounts-dialogs'),
  telegramAccountsLogout: body('accounts-logout'),
  // Voice chats, video chats and live streams (R-Y188): the chat's call,
  // its panel and participants, Notify me, who to join as, joining (muted,
  // with the join params JSON), leaving, our own mute and raised hand.
  telegramCallInfo: body('call-info'),
  telegramCallOpen: body('call-open'),
  telegramCallParticipants: body('call-participants'),
  telegramCallNotify: body('call-notify'),
  telegramCallJoinAs: body('call-join-as'),
  telegramCallJoin: body('call-join'),
  telegramCallLeave: body('call-leave'),
  telegramCallSelf: body('call-self'),
  // Private one-to-one voice calls (R-Y196): placed, accepted, ended and
  // rated only on a click; the call itself arrives as a live link.
  telegramPrivateCallStart: body('private-call-start'),
  telegramPrivateCallAccept: body('private-call-accept'),
  telegramPrivateCallDiscard: body('private-call-discard'),
  telegramPrivateCallRate: body('private-call-rate'),
  telegramPrivateCallState: none('private-call-state'),
  // Managing the topics (R-Y153).
  telegramTopicIcons: none('topic-icons'),
  telegramTopicCreate: body('topic-create'),
  telegramTopicEdit: body('topic-edit'),
  telegramTopicPin: body('topic-pin'),
  telegramTopicDelete: body('topic-delete'),
  telegramForumToggle: body('forum-toggle'),
  // The chat list's folders.
  telegramFolders: body('folders'),
  // Folders made, changed, deleted, ordered (R-Y164): { id?, folder },
  // { id }, { order } (every folder id, 0 for "All chats"), and the
  // recommended ones.
  telegramFolderSave: body('folder-save'),
  telegramFolderDelete: body('folder-delete'),
  telegramFoldersReorder: body('folders-reorder'),
  telegramFoldersSuggested: body('folders-suggested'),
  // Shared folders, chat lists (R-Y172): the folder's links, made, edited,
  // deleted; what an addlist link leads to and joining it; leaving.
  telegramChatlistInvites: body('chatlist-invites'),
  telegramChatlistExport: body('chatlist-export'),
  telegramChatlistInviteEdit: body('chatlist-invite-edit'),
  telegramChatlistInviteDelete: body('chatlist-invite-delete'),
  telegramChatlistCheck: body('chatlist-check'),
  telegramChatlistJoin: body('chatlist-join'),
  telegramChatlistLeaveSuggestions: body('chatlist-leave-suggestions'),
  telegramChatlistLeave: body('chatlist-leave'),
  // Stickers and saved GIFs (R-Y105): the panel's lists ({ fresh }),
  // a set's stickers ({ id }), one sent ({ chat, id, replyTo, silent,
  // scheduleDate, clientId }).
  telegramStickers: body('stickers'),
  telegramStickerSet: body('sticker-set'),
  telegramGifs: body('gifs'),
  telegramGifSave: body('gif-save'),
  telegramForumView: body('forum-view'),
  // Stickers ({ q, lang }) and GIFs ({ q, offset }) searched (R-Y112).
  telegramStickerSearch: body('sticker-search'),
  telegramEmojiKeywords: body('emoji-keywords'),
  telegramInviteCheck: body('invite-check'),
  telegramInviteJoin: body('invite-join'),
  telegramInviteRevoke: body('invite-revoke'),
  telegramComments: body('comments'),
  telegramCommentSend: body('comment-send'),
  telegramCommentsRead: body('comments-read'),
  // Who read a message ({ chat, id }), who reacted ({ chat, id, emoji?,
  // offset? }) (R-Y127).
  telegramReaders: body('readers'),
  telegramTranslate: body('translate'),
  // Voice and video note transcription (R-Y175).
  telegramTranscribe: body('transcribe'),
  telegramTranscribeRate: body('transcribe-rate'),
  telegramBotCommands: body('bot-commands'),
  // A game message's high scores ({ chat, id }, R-Y190).
  telegramGameScores: body('game-scores'),
  // A bot's request-peer button: who may answer it, the answer; a chat's
  // recent places (R-Y208).
  telegramRequestPeerCandidates: body('request-peer-candidates'),
  telegramRequestPeerSend: body('request-peer-send'),
  telegramRecentLocations: body('recent-locations'),
  // Bot mini apps (R-Y168).
  telegramWebAppOpen: body('web-app-open'),
  telegramWebAppProlong: body('web-app-prolong'),
  telegramWebAppData: body('web-app-data'),
  // Inline bots in the message box (R-Y138).
  // Links to messages: copy one, open one (R-Y154).
  telegramMessageLink: body('message-link'),
  telegramResolveLink: body('resolve-link'),
  telegramInlineBot: body('inline-bot'),
  telegramInlineResults: body('inline-results'),
  telegramInlineSend: body('inline-send'),
  telegramInlineStartBot: body('inline-start-bot'),
  // The message box's link preview, and its picture (R-Y145).
  telegramLinkPreview: body('link-preview'),
  telegramReactors: body('reactors'),
  // New groups and channels, a chat's info edited (R-Y129).
  telegramChatContacts: none('chat-contacts'),
  // The Contacts window and read times (R-Y189).
  telegramContactStatuses: none('contact-statuses'),
  telegramReadTime: body('message-read-time'),
  telegramGroupCreate: body('group-create'),
  telegramChannelCreate: body('channel-create'),
  telegramChatEdit: body('chat-edit'),
  // A group's permissions, slow mode and recent actions (R-Y133).
  telegramChatPermissions: body('chat-permissions'),
  telegramChatPermissionsSet: body('chat-permissions-set'),
  telegramSlowMode: body('slow-mode'),
  telegramAdminLog: body('admin-log'),
  // Which reactions a group or channel allows (R-Y160).
  telegramAvailableReactions: none('available-reactions'),
  // A group's and channel's settings (R-Y165).
  telegramChatSettingSet: body('chat-setting'),
  telegramDiscussionGroups: body('discussion-groups'),
  telegramDiscussionSet: body('discussion-set'),
  telegramChatReactionsSet: body('chat-reactions-set'),
  // Invite links and join requests (R-Y152).
  telegramInviteLinks: body('invite-links'),
  telegramInviteCreate: body('invite-create'),
  telegramInviteEdit: body('invite-edit'),
  telegramInviteDelete: body('invite-delete'),
  telegramInviteDeleteRevoked: body('invite-delete-revoked'),
  telegramInviteImporters: body('invite-importers'),
  telegramJoinRequestHide: body('join-request-hide'),
  telegramJoinRequestsHideAll: body('join-requests-hide-all'),
  // A chat's auto-delete timer, Saved Messages by chat (R-Y143).
  telegramHistoryTtl: body('history-ttl'),
  telegramSavedDialogs: body('saved-dialogs'),
  telegramSavedHistory: body('saved-history'),
  telegramSavedDelete: body('saved-delete'),
  // Pinned Saved Messages chats, archive settings, websites (R-Y174).
  telegramSavedPin: body('saved-pin'),
  telegramSavedReorder: body('saved-reorder'),
  telegramArchiveSettings: none('archive-settings'),
  telegramArchiveSettingsSet: body('archive-settings-set'),
  telegramWebSessions: none('web-sessions'),
  telegramWebSessionReset: body('web-session-reset'),
  telegramWebSessionsResetAll: none('web-sessions-reset-all'),
  // Reaction tags of Saved Messages and the default timer (R-Y151).
  telegramSavedTags: none('saved-tags'),
  telegramSavedTagSearch: body('saved-tag-search'),
  telegramSavedTagRename: body('saved-tag-rename'),
  // Channel boosts (R-Y173).
  telegramBoostsStatus: body('boosts-status'),
  telegramMyBoosts: body('my-boosts'),
  telegramBoostApply: body('boost-apply'),
  telegramBoosters: body('boosters'),
  // Birthday, name and profile colours, personal channel (R-Y178).
  telegramProfileExtras: none('profile-extras'),
  telegramBirthdaySave: body('birthday-save'),
  telegramProfileColors: none('profile-colors'),
  telegramColorSave: body('color-save'),
  telegramPersonalChannels: none('personal-channels'),
  telegramPersonalChannelSave: body('personal-channel-save'),
  telegramPersonalChannel: body('personal-channel'),
  telegramContactBirthdays: none('contact-birthdays'),
  // Telegram Business (R-Y180): opening hours, location, intro, chat
  // links, the chatbot and folder tags. Writes only on Save or confirm.
  telegramBusinessHours: none('business-hours'),
  telegramBusinessHoursSet: body('business-hours-set'),
  telegramBusinessLocation: none('business-location'),
  telegramBusinessLocationSet: body('business-location-set'),
  telegramBusinessIntro: none('business-intro'),
  telegramBusinessIntroStickers: none('business-intro-stickers'),
  telegramBusinessIntroSet: body('business-intro-set'),
  telegramBusinessProfile: body('business-profile'),
  telegramBusinessLinks: none('business-links'),
  telegramBusinessLinkCreate: body('business-link-create'),
  telegramBusinessLinkEdit: body('business-link-edit'),
  telegramBusinessLinkDelete: body('business-link-delete'),
  telegramBusinessLinkResolve: body('business-link-resolve'),
  telegramBusinessBot: none('business-bot'),
  telegramBusinessBotSet: body('business-bot-set'),
  telegramBusinessBotRemove: none('business-bot-remove'),
  telegramBusinessBotChat: body('business-bot-chat'),
  telegramBusinessBotPause: body('business-bot-pause'),
  telegramBusinessBotDisable: body('business-bot-disable'),
  telegramFoldersTagsSet: body('folders-tags-set'),
  // Telegram Stars (R-Y176).
  telegramStarsStatus: none('stars-status'),
  telegramStarsHistory: body('stars-history'),
  telegramStarGifts: body('star-gifts'),
  telegramStarGiftSave: body('star-gift-save'),
  telegramPaidReaction: body('paid-reaction'),
  telegramPaidMediaUnlock: body('paid-media-unlock'),
  // Stories and music on a profile, sending a gift (R-Y185).
  telegramProfileStories: body('profile-stories'),
  telegramStoriesArchive: body('stories-archive'),
  telegramStoryPin: body('story-pin'),
  telegramStoryPinTop: body('story-pin-top'),
  telegramSavedMusic: body('saved-music'),
  telegramMusicSave: body('music-save'),
  telegramMusicRemove: body('music-remove'),
  telegramGiftCatalogue: body('gift-catalogue'),
  telegramGiftSend: body('gift-send'),
  // Managing received gifts, unique gifts and gift codes (R-Y193).
  telegramGiftConvert: body('gift-convert'),
  telegramGiftUpgradePreview: body('gift-upgrade-preview'),
  telegramGiftUpgrade: body('gift-upgrade'),
  telegramGiftTransfer: body('gift-transfer'),
  telegramGiftPin: body('gift-pin'),
  telegramGiftUnique: body('gift-unique'),
  telegramGiftCodeCheck: body('gift-code-check'),
  telegramGiftCodeApply: body('gift-code-apply'),
  telegramDefaultTtl: none('privacy-ttl'),
  telegramDefaultTtlSet: body('privacy-ttl-set'),
  // Viewing stories (R-Y140): the strip, one peer's, seen up to an id,
  // and a story's picture or video.
  telegramStories: body('stories'),
  telegramStoriesPeer: body('stories-peer'),
  telegramStoriesRead: body('stories-read'),
  // Story interactions (R-Y148): a private reply, a reaction, the viewers
  // of one's own story, deleting it, and hiding a peer's stories.
  telegramStoryReply: body('story-reply'),
  telegramStoryReact: body('story-react'),
  telegramStoryViews: body('story-views'),
  telegramStoryDelete: body('story-delete'),
  // Stealth mode, reactions list, report and fresh counts (R-Y199).
  telegramStoryStealth: body('story-stealth'),
  telegramStoryReactions: body('story-reactions'),
  telegramStoryReport: body('story-report'),
  telegramStoriesViews: body('stories-views'),
  telegramStoriesHide: body('stories-hide'),
  // Posting a story (R-Y156): whether the user may, then the upload's
  // token with the story's options → { ok } or { ok: false, code }.
  telegramStoryCanPost: none('story-can-post'),
  telegramStoryPost: body('story-post'),
  // Chat backgrounds (R-Y155): the list Telegram offers, a picture's
  // address, and one set for a chat (for the user only).
  telegramWallpapers: body('wallpapers'),
  telegramChatWallpaperSet: body('chat-wallpaper-set'),
  // Telegram Business: quick replies, greeting and away messages (R-Y179).
  telegramQuickReplies: none('quick-replies'),
  telegramQuickReplyMessages: body('quick-reply-messages'),
  telegramQuickReplyCreate: body('quick-reply-create'),
  telegramQuickReplyAdd: body('quick-reply-add'),
  telegramQuickReplyEdit: body('quick-reply-edit'),
  telegramQuickReplyDeleteMessages: body('quick-reply-delete-messages'),
  telegramQuickReplyRename: body('quick-reply-rename'),
  telegramQuickReplyDelete: body('quick-reply-delete'),
  telegramQuickReplyReorder: body('quick-reply-reorder'),
  telegramQuickReplySend: body('quick-reply-send'),
  telegramBusinessMessages: none('business-messages'),
  telegramBusinessGreetingSave: body('business-greeting-save'),
  telegramBusinessAwaySave: body('business-away-save'),
  // Notification sounds (R-Y181): the saved ringtones, one added from an
  // upload's token, one removed, and the audio's address.
  telegramRingtones: none('ringtones'),
  telegramRingtoneAdd: body('ringtone-add'),
  telegramRingtoneRemove: body('ringtone-remove'),
  // The user's own profile (R-Y136).
  telegramProfile: none('profile'),
  telegramProfileSave: body('profile-save'),
  telegramUsernameCheck: body('username-check'),
  telegramUsernameSave: body('username-save'),
  telegramProfilePhoto: body('profile-photo'),
  // Privacy and security (R-Y139).
  telegramPrivacy: none('privacy'),
  telegramPrivacySet: body('privacy-set'),
  telegramAuthorizations: none('sessions'),
  telegramSessionTerminate: body('session-terminate'),
  telegramSessionsTerminateOthers: none('sessions-terminate-others'),
  // Two-step verification, self-destruct, sensitive content and per-session
  // settings (R-Y177).
  telegramSecurity: none('security'),
  telegramPasswordSet: body('password-set'),
  telegramPasswordRemove: body('password-remove'),
  telegramPasswordEmailConfirm: body('password-email-confirm'),
  telegramPasswordEmailResend: none('password-email-resend'),
  telegramPasswordEmailCancel: none('password-email-cancel'),
  telegramAccountTtlSet: body('account-ttl-set'),
  telegramSensitiveSet: body('sensitive-set'),
  telegramSessionSettings: body('session-settings'),
  telegramSessionTtlSet: body('session-ttl-set'),
  telegramBlocked: body('blocked'),
  telegramUnblock: body('unblock'),
  // A group's members ({ chat, q, offset, limit }) and one removed
  // ({ chat, user }) (R-Y125).
  telegramMembers: body('members'),
  telegramMemberRemove: body('member-remove'),
  // Delete all from a member, anti-spam false positives, a broadcast group,
  // ownership and the channels left (R-Y200).
  telegramModerateUser: body('moderate-user'),
  telegramNotSpam: body('not-spam'),
  telegramConvertGigagroup: body('convert-gigagroup'),
  telegramTransferOwnership: body('transfer-ownership'),
  telegramLeftChannels: body('left-channels'),
  // Block, contacts and report (R-Y128).
  telegramPeerBlock: body('peer-block'),
  telegramPeerContact: body('peer-contact'),
  telegramPeerReport: body('peer-report'),
  telegramPeerReportSpam: body('peer-report-spam'),
  // The bar over a chat with a stranger (R-Y137).
  // The message effects Telegram offers (R-Y149).
  telegramEffects: body('effects'),
  // Emoji statuses (R-Y162).
  telegramEmojiStatuses: body('emoji-statuses'),
  telegramEmojiStatusSet: body('emoji-status-set'),
  // Settings → Stickers and emoji, close friends, a contact by phone (R-Y169).
  telegramStickerSets: body('sticker-sets'),
  telegramStickerSetsReorder: body('sticker-sets-reorder'),
  telegramStickerSetArchive: body('sticker-set-archive'),
  telegramStickerSetRemove: body('sticker-set-remove'),
  telegramStickerSetAdd: body('sticker-set-add'),
  telegramStickerSetsArchived: body('sticker-sets-archived'),
  telegramCloseFriends: body('close-friends'),
  telegramCloseFriendsSet: body('close-friends-set'),
  telegramContactImport: body('contact-import'),
  // Chat themes and several usernames (R-Y170).
  telegramChatThemes: body('chat-themes'),
  telegramChatThemeSet: body('chat-theme-set'),
  telegramUsernameToggle: body('username-toggle'),
  telegramUsernamesReorder: body('usernames-reorder'),
  telegramSendAs: body('send-as'),
  telegramSendAsSave: body('send-as-save'),
  // The recent calls list (R-Y163).
  telegramCalls: body('calls'),
  telegramNotifySettings: none('notify-settings'),
  telegramNotifySettingsSet: body('notify-settings-set'),
  telegramNotifyChat: body('notify-chat'),
  telegramCommonChats: body('common-chats'),
  // Statistics of a channel or supergroup (R-Y167).
  telegramChatStats: body('chat-stats'),
  telegramStatsGraph: body('stats-graph'),
  // The pinned messages list, similar channels, fact checks (R-Y166).
  telegramPinnedList: body('pinned-list'),
  telegramUnpinAll: body('unpin-all'),
  telegramSimilarChannels: body('similar-channels'),
  telegramSimilarJoin: body('similar-join'),
  // Popular mini apps, similar bots, prepared messages, collectibles (R-Y194).
  telegramAppsPopular: body('apps-popular'),
  telegramBotSimilar: body('bot-similar'),
  telegramPreparedMessage: body('prepared-message'),
  telegramCollectibleInfo: body('collectible-info'),
  telegramFactChecks: body('fact-checks'),
  // A hashtag's messages and the live counters of posts (R-Y182).
  telegramSearchTag: body('search-tag'),
  telegramMessageViews: body('message-views'),
  telegramNotifyChatSet: body('notify-chat-set'),
  telegramPeerSettings: body('peer-settings'),
  telegramPeerHideBar: body('peer-hide-bar'),
  telegramPeerShareContact: body('peer-share-contact'),
  telegramGifSearch: body('gif-search'),
  // The panel's menu ({ id, action }; R-Y115).
  telegramStickerSave: body('sticker-save'),
  telegramStickerSetBox: body('sticker-set-box'),
  // A die's animations ({ emoticon }; R-Y130).
  telegramDice: body('dice'),
  telegramStickerSetInstall: body('sticker-set-install'),
  telegramSendDocument: body('send-document'),
  // A chat's scheduled messages (R-Y102): { chat } → { ok, links };
  // sent now, deleted ({ chat, ids }), moved ({ chat, id, date }).
  telegramScheduled: body('scheduled'),
  telegramScheduledSend: body('scheduled-send'),
  telegramScheduledDelete: body('scheduled-delete'),
  // A place or a contact from the composer (R-Y142): { chat, lat, lon,
  // accuracy?, live? }, { chat, id } to stop a live location, { chat,
  // contact | firstName, lastName, phone }.
  telegramSendLocation: body('send-location'),
  telegramStopLive: body('stop-live-location'),
  telegramUpdateLive: body('update-live-location'),
  // Exporting a chat's history to a folder (R-Y186): the default folder and
  // the running export, start ({ chat, media, sizeLimitMb, from, to,
  // formats, folder }), status, cancel, and the folder shown.
  telegramExportDefaults: none('export-defaults'),
  telegramExportStart: body('export-start'),
  telegramExportStatus: none('export-status'),
  telegramExportCancel: none('export-cancel'),
  telegramExportReveal: none('export-reveal'),
  // Paid messages (R-Y184): what a message costs in a chat ({ chat } →
  // { stars }), the price charged to non-contacts and its save ({ stars }),
  // what one person paid ({ user }), letting them write free or pay again
  // ({ user, allow, refund? }), a group's price ({ chat, stars }).
  telegramPaidPrice: body('paid-price'),
  telegramPaidSettings: none('paid-settings'),
  telegramPaidSettingsSave: body('paid-settings-save'),
  telegramPaidRevenue: body('paid-revenue'),
  telegramPaidException: body('paid-exception'),
  telegramPaidPriceSave: body('paid-price-save'),
  // A giveaway's details ({ chat, id, channels?, winners? }; R-Y184).
  telegramGiveawayInfo: body('giveaway-info'),
  // The connection proxy (R-Y192): read it (never the password or secret),
  // save it, and a short TCP check of its address.
  telegramProxyGet: none('proxy-get'),
  telegramProxySave: body('proxy-save'),
  telegramProxyCheck: body('proxy-check'),
  // Channel direct messages and suggested posts (R-Y191): a monoforum's
  // threads ({ chat }), a thread ({ chat, peer?, before? }), a message
  // ({ chat, text, peer?, stars?, suggestedPost? }), a decision ({ chat,
  // id, approve, scheduleDate?, comment? }).
  telegramChannelDmThreads: body('channel-dm-threads'),
  telegramChannelDmHistory: body('channel-dm-history'),
  telegramChannelDmSend: body('channel-dm-send'),
  telegramChannelDmDecide: body('channel-dm-decide'),
  // Bot login links and attachment-menu bots (R-Y201).
  telegramBotUrlAuth: body('bot-url-auth'),
  telegramBotUrlAccept: body('bot-url-accept'),
  telegramUrlAuthDomains: none('url-auth-domains'),
  telegramAttachMenuBots: none('attach-menu-bots'),
  telegramAttachMenuBot: body('attach-menu-bot'),
  telegramAttachMenuToggle: body('attach-menu-toggle'),
  // Adding members and administrators (R-Y204): who can be added ({ chat }),
  // adding ({ chat, users }), sending the invite link to those who could
  // not be added ({ chat, users }), the administrators ({ chat }), one made
  // or dismissed ({ chat, user, rights?, rank?, dismiss?, broadcast? }), the
  // history new members see ({ chat, hidden }) and upgrading a basic group
  // to a supergroup ({ chat }).
  telegramAddCandidates: body('chat-add-candidates'),
  telegramMembersAdd: body('members-add'),
  telegramMembersInviteLink: body('members-invite-link'),
  telegramChatAdmins: body('chat-admins'),
  telegramAdminSet: body('admin-set'),
  telegramHistoryHidden: body('history-hidden'),
  telegramGroupUpgrade: body('group-upgrade'),
};
