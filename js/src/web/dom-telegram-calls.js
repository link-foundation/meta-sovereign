// The page's Telegram calls that are a plain POST to /api/telegram/<route>,
// spread into `api` by ./dom.js (moved out of it for its size): `body`
// passes the caller's body on, `none` always sends {}. The comments name
// what each group is for and its requirement.

const body = (route) => ({ route, body: true });
const none = (route) => ({ route, body: false });
const readBody = (route) => ({ ...body(route), read: true });
const readNone = (route) => ({ ...none(route), read: true });

export const TELEGRAM_CALLS = {
  // A press on an ephemeral message's callback button ({ chat, id, data })
  // -> the bot's answer (R-Y223).
  telegramEphemeralCallback: body('ephemeral-callback'),
  // Local storage management (usage, clear by kind or all, the size and age
  // limits), reaction notifications, resetting all notifications and
  // Telegram's automatic-download preset (R-Y215).
  telegramStorageUsage: readNone('storage-usage'),
  telegramStorageClear: body('storage-clear'),
  telegramStorageLimits: readNone('storage-limits'),
  telegramStorageLimitsSet: body('storage-limits-set'),
  telegramReactionNotify: readNone('reaction-notify'),
  telegramReactionNotifySet: body('reaction-notify-set'),
  telegramNotifyReset: none('notify-reset'),
  telegramAutoDownloadPreset: readNone('auto-download-preset'),
  // A channel's public link, colours and emoji status, inactive channels to
  // leave (R-Y216); deleting a chat is telegramRemoveChat with 'destroy'.
  telegramChannelUsernameCheck: readBody('channel-username-check'),
  telegramChannelUsernameSave: body('channel-username-save'),
  telegramPublicChannels: readNone('public-channels'),
  telegramPublicLinkRevoke: body('public-link-revoke'),
  telegramUsernamesDeactivate: body('usernames-deactivate'),
  telegramChannelColorSave: body('channel-color-save'),
  telegramChannelEmojiStatus: body('channel-emoji-status'),
  telegramInactiveChannels: readNone('inactive-channels'),
  telegramLeaveChannels: body('leave-channels'),
  // Contact extras (R-Y217): a note, the share-my-contact link and opening
  // one, a phone link, a photo for a contact, a suggested birthday, the
  // synced contacts and Block user in the Replies chat.
  telegramContactNote: body('contact-note'),
  telegramContactToken: none('contact-token'),
  telegramContactTokenOpen: body('contact-token-open'),
  telegramPhoneResolve: readBody('phone-resolve'),
  telegramContactPhoto: body('contact-photo'),
  telegramBirthdaySuggest: body('birthday-suggest'),
  telegramSavedContacts: readNone('saved-contacts'),
  telegramSavedContactsReset: none('saved-contacts-reset'),
  telegramBlockFromReplies: body('block-from-replies'),
  // Change phone number (the code goes to the new number) and Export
  // Telegram data through a takeout session (R-Y212).
  telegramPhoneChangeSend: body('phone-change-send'),
  telegramPhoneChangeConfirm: body('phone-change-confirm'),
  telegramDataExportStart: body('data-export-start'),
  telegramDataExportStatus: readNone('data-export-status'),
  telegramDataExportCancel: none('data-export-cancel'),
  telegramDataExportReveal: none('data-export-reveal'),
  // A group's sticker set and emoji pack ({ chat, shortName|null, emojis? }),
  // the pinned topics' order ({ chat, order }), a shared folder's new chats
  // looked at, joined and hidden ({ id, chats? }), and the new-contacts
  // notification read and set ({ on }) (R-Y211).
  telegramGroupStickerSet: body('group-sticker-set'),
  telegramTopicReorder: body('topic-reorder'),
  telegramChatlistUpdates: readBody('chatlist-updates'),
  telegramChatlistUpdatesJoin: body('chatlist-updates-join'),
  telegramChatlistUpdatesHide: body('chatlist-updates-hide'),
  telegramContactSignUp: readNone('contact-signup'),
  telegramContactSignUpSet: body('contact-signup-set'),
  // Cloud drafts synced and cleared, the calendar's day counts, frequent
  // contacts listed, removed and turned off (R-Y207).
  telegramDraftsSync: readNone('drafts-sync'),
  telegramDraftsClear: none('drafts-clear'),
  telegramCalendar: readBody('calendar'),
  telegramTopPeers: readNone('top-peers'),
  telegramTopPeerRemove: body('top-peers-remove'),
  telegramTopPeersToggle: body('top-peers-toggle'),
  // Checklists (new, "Add tasks"), a reaction reported, a post's
  // statistics and public shares, Stars revenue (R-Y195).
  telegramSendTodo: body('send-todo'),
  telegramAppendTodo: body('todo-append'),
  telegramReportReaction: body('reaction-report'),
  telegramMessageStats: readBody('message-stats'),
  telegramPublicForwards: readBody('public-forwards'),
  telegramStarsRevenue: readBody('stars-revenue'),
  // More than one account (R-Y198): the signed-in accounts, the other
  // accounts' unread counts ({ all } adds account 1's, R-Y202), one extra account's chat list ({ account })
  // and logging an extra account out ({ account }).
  telegramAccounts: readNone('accounts'),
  telegramAccountsUnread: readBody('accounts-unread'),
  telegramAccountsDialogs: readBody('accounts-dialogs'),
  telegramAccountsLogout: body('accounts-logout'),
  // Voice chats, video chats and live streams (R-Y188): the chat's call,
  // its panel and participants, Notify me, who to join as, joining (muted,
  // with the join params JSON), leaving, our own mute and raised hand.
  telegramCallInfo: readBody('call-info'),
  telegramCallOpen: body('call-open'),
  telegramCallParticipants: readBody('call-participants'),
  telegramCallNotify: body('call-notify'),
  telegramCallJoinAs: readBody('call-join-as'),
  telegramCallJoin: body('call-join'),
  telegramCallLeave: body('call-leave'),
  telegramCallSelf: body('call-self'),
  // Private one-to-one voice calls (R-Y196): placed, accepted, ended and
  // rated only on a click; the call itself arrives as a live link.
  telegramPrivateCallStart: body('private-call-start'),
  telegramPrivateCallAccept: body('private-call-accept'),
  telegramPrivateCallDiscard: body('private-call-discard'),
  telegramPrivateCallRate: body('private-call-rate'),
  telegramPrivateCallState: readNone('private-call-state'),
  // Managing the topics (R-Y153).
  telegramTopicIcons: readNone('topic-icons'),
  telegramTopicCreate: body('topic-create'),
  telegramTopicEdit: body('topic-edit'),
  telegramTopicPin: body('topic-pin'),
  telegramTopicDelete: body('topic-delete'),
  telegramForumToggle: body('forum-toggle'),
  // The chat list's folders.
  telegramFolders: readBody('folders'),
  // Folders made, changed, deleted, ordered (R-Y164): { id?, folder },
  // { id }, { order } (every folder id, 0 for "All chats"), and the
  // recommended ones.
  telegramFolderSave: body('folder-save'),
  telegramFolderDelete: body('folder-delete'),
  telegramFoldersReorder: body('folders-reorder'),
  telegramFoldersSuggested: readBody('folders-suggested'),
  // Shared folders, chat lists (R-Y172): the folder's links, made, edited,
  // deleted; what an addlist link leads to and joining it; leaving.
  telegramChatlistInvites: readBody('chatlist-invites'),
  telegramChatlistExport: body('chatlist-export'),
  telegramChatlistInviteEdit: body('chatlist-invite-edit'),
  telegramChatlistInviteDelete: body('chatlist-invite-delete'),
  telegramChatlistCheck: readBody('chatlist-check'),
  telegramChatlistJoin: body('chatlist-join'),
  telegramChatlistLeaveSuggestions: readBody('chatlist-leave-suggestions'),
  telegramChatlistLeave: body('chatlist-leave'),
  // Stickers and saved GIFs (R-Y105): the panel's lists ({ fresh }),
  // a set's stickers ({ id }), one sent ({ chat, id, replyTo, silent,
  // scheduleDate, clientId }).
  telegramStickers: readBody('stickers'),
  telegramStickerSet: readBody('sticker-set'),
  telegramGifs: readBody('gifs'),
  telegramGifSave: body('gif-save'),
  telegramForumView: body('forum-view'),
  // Stickers ({ q, lang }) and GIFs ({ q, offset }) searched (R-Y112).
  telegramStickerSearch: readBody('sticker-search'),
  telegramEmojiKeywords: readBody('emoji-keywords'),
  telegramInviteCheck: readBody('invite-check'),
  telegramInviteJoin: body('invite-join'),
  telegramInviteRevoke: body('invite-revoke'),
  telegramComments: readBody('comments'),
  telegramCommentSend: body('comment-send'),
  telegramCommentsRead: body('comments-read'),
  // Who read a message ({ chat, id }), who reacted ({ chat, id, emoji?,
  // offset? }) (R-Y127).
  telegramReaders: readBody('readers'),
  telegramTranslate: body('translate'),
  // The translate bar's Premium check and a message's summary (R-Y213).
  telegramTranslateAccount: readNone('translate-account'),
  telegramSummarize: body('summarize'),
  // Voice and video note transcription (R-Y175).
  telegramTranscribe: body('transcribe'),
  telegramTranscribeRate: body('transcribe-rate'),
  telegramBotCommands: readBody('bot-commands'),
  // A game message's high scores ({ chat, id }, R-Y190).
  telegramGameScores: readBody('game-scores'),
  // A bot's request-peer button: who may answer it, the answer; a chat's
  // recent places (R-Y208).
  telegramRequestPeerCandidates: readBody('request-peer-candidates'),
  telegramRequestPeerSend: body('request-peer-send'),
  telegramRecentLocations: readBody('recent-locations'),
  // Bot mini apps (R-Y168).
  telegramWebAppOpen: body('web-app-open'),
  telegramWebAppProlong: body('web-app-prolong'),
  telegramWebAppData: body('web-app-data'),
  // Inline bots in the message box (R-Y138).
  // Links to messages: copy one, open one (R-Y154).
  telegramMessageLink: readBody('message-link'),
  telegramResolveLink: readBody('resolve-link'),
  telegramInlineBot: readBody('inline-bot'),
  telegramInlineResults: readBody('inline-results'),
  telegramInlineSend: body('inline-send'),
  telegramInlineStartBot: body('inline-start-bot'),
  // The message box's link preview, and its picture (R-Y145).
  telegramLinkPreview: readBody('link-preview'),
  // Instant View (R-Y205): a link's cached page as a safe tree.
  telegramInstantView: readBody('instant-view'),
  telegramReactors: readBody('reactors'),
  // New groups and channels, a chat's info edited (R-Y129).
  telegramChatContacts: readNone('chat-contacts'),
  // The Contacts window and read times (R-Y189).
  telegramContactStatuses: readNone('contact-statuses'),
  telegramReadTime: readBody('message-read-time'),
  telegramGroupCreate: body('group-create'),
  telegramChannelCreate: body('channel-create'),
  telegramChatEdit: body('chat-edit'),
  // A group's permissions, slow mode and recent actions (R-Y133).
  telegramChatPermissions: readBody('chat-permissions'),
  telegramChatPermissionsSet: body('chat-permissions-set'),
  telegramSlowMode: body('slow-mode'),
  telegramAdminLog: readBody('admin-log'),
  // Which reactions a group or channel allows (R-Y160).
  telegramAvailableReactions: readNone('available-reactions'),
  // A group's and channel's settings (R-Y165).
  telegramChatSettingSet: body('chat-setting'),
  telegramDiscussionGroups: readBody('discussion-groups'),
  telegramDiscussionSet: body('discussion-set'),
  telegramChatReactionsSet: body('chat-reactions-set'),
  // Invite links and join requests (R-Y152).
  telegramInviteLinks: readBody('invite-links'),
  telegramInviteCreate: body('invite-create'),
  telegramInviteEdit: body('invite-edit'),
  telegramInviteDelete: body('invite-delete'),
  telegramInviteDeleteRevoked: body('invite-delete-revoked'),
  telegramInviteImporters: readBody('invite-importers'),
  telegramJoinRequestHide: body('join-request-hide'),
  telegramJoinRequestsHideAll: body('join-requests-hide-all'),
  // A chat's auto-delete timer, Saved Messages by chat (R-Y143).
  telegramHistoryTtl: body('history-ttl'),
  telegramSavedDialogs: readBody('saved-dialogs'),
  telegramSavedHistory: readBody('saved-history'),
  telegramSavedDelete: body('saved-delete'),
  // Pinned Saved Messages chats, archive settings, websites (R-Y174).
  telegramSavedPin: body('saved-pin'),
  telegramSavedReorder: body('saved-reorder'),
  telegramArchiveSettings: readNone('archive-settings'),
  telegramArchiveSettingsSet: body('archive-settings-set'),
  telegramWebSessions: readNone('web-sessions'),
  telegramWebSessionReset: body('web-session-reset'),
  telegramWebSessionsResetAll: none('web-sessions-reset-all'),
  // Reaction tags of Saved Messages and the default timer (R-Y151).
  telegramSavedTags: readNone('saved-tags'),
  telegramSavedTagSearch: readBody('saved-tag-search'),
  telegramSavedTagRename: body('saved-tag-rename'),
  // Channel boosts (R-Y173).
  telegramBoostsStatus: readBody('boosts-status'),
  telegramMyBoosts: readBody('my-boosts'),
  telegramBoostApply: body('boost-apply'),
  telegramBoosters: readBody('boosters'),
  // Birthday, name and profile colours, personal channel (R-Y178).
  telegramProfileExtras: readNone('profile-extras'),
  telegramBirthdaySave: body('birthday-save'),
  telegramProfileColors: readNone('profile-colors'),
  telegramColorSave: body('color-save'),
  telegramPersonalChannels: readNone('personal-channels'),
  telegramPersonalChannelSave: body('personal-channel-save'),
  telegramPersonalChannel: readBody('personal-channel'),
  telegramContactBirthdays: readNone('contact-birthdays'),
  // Telegram Business (R-Y180): opening hours, location, intro, chat
  // links, the chatbot and folder tags. Writes only on Save or confirm.
  telegramBusinessHours: readNone('business-hours'),
  telegramBusinessHoursSet: body('business-hours-set'),
  telegramBusinessLocation: readNone('business-location'),
  telegramBusinessLocationSet: body('business-location-set'),
  telegramBusinessIntro: readNone('business-intro'),
  telegramBusinessIntroStickers: readNone('business-intro-stickers'),
  telegramBusinessIntroSet: body('business-intro-set'),
  telegramBusinessProfile: readBody('business-profile'),
  telegramBusinessLinks: readNone('business-links'),
  telegramBusinessLinkCreate: body('business-link-create'),
  telegramBusinessLinkEdit: body('business-link-edit'),
  telegramBusinessLinkDelete: body('business-link-delete'),
  telegramBusinessLinkResolve: readBody('business-link-resolve'),
  telegramBusinessBot: readNone('business-bot'),
  telegramBusinessBotSet: body('business-bot-set'),
  telegramBusinessBotRemove: none('business-bot-remove'),
  telegramBusinessBotChat: readBody('business-bot-chat'),
  telegramBusinessBotPause: body('business-bot-pause'),
  telegramBusinessBotDisable: body('business-bot-disable'),
  telegramFoldersTagsSet: body('folders-tags-set'),
  // Telegram Stars (R-Y176).
  telegramStarsStatus: readNone('stars-status'),
  telegramStarsHistory: readBody('stars-history'),
  telegramStarGifts: readBody('star-gifts'),
  telegramStarGiftSave: body('star-gift-save'),
  telegramPaidReaction: body('paid-reaction'),
  telegramPaidMediaUnlock: body('paid-media-unlock'),
  // Stories and music on a profile, sending a gift (R-Y185).
  telegramProfileStories: readBody('profile-stories'),
  telegramStoriesArchive: readBody('stories-archive'),
  telegramStoryPin: body('story-pin'),
  telegramStoryPinTop: body('story-pin-top'),
  telegramSavedMusic: readBody('saved-music'),
  telegramMusicSave: body('music-save'),
  telegramMusicRemove: body('music-remove'),
  telegramGiftCatalogue: readBody('gift-catalogue'),
  telegramGiftSend: body('gift-send'),
  // Managing received gifts, unique gifts and gift codes (R-Y193).
  telegramGiftConvert: body('gift-convert'),
  telegramGiftUpgradePreview: readBody('gift-upgrade-preview'),
  telegramGiftUpgrade: body('gift-upgrade'),
  telegramGiftTransfer: body('gift-transfer'),
  telegramGiftPin: body('gift-pin'),
  telegramGiftUnique: readBody('gift-unique'),
  telegramGiftCodeCheck: readBody('gift-code-check'),
  telegramGiftCodeApply: body('gift-code-apply'),
  telegramDefaultTtl: readNone('privacy-ttl'),
  telegramDefaultTtlSet: body('privacy-ttl-set'),
  // Viewing stories (R-Y140): the strip, one peer's, seen up to an id,
  // and a story's picture or video.
  telegramStories: readBody('stories'),
  telegramStoriesPeer: readBody('stories-peer'),
  telegramStoriesRead: body('stories-read'),
  // Story interactions (R-Y148): a private reply, a reaction, the viewers
  // of one's own story, deleting it, and hiding a peer's stories.
  telegramStoryReply: body('story-reply'),
  telegramStoryReact: body('story-react'),
  telegramStoryViews: readBody('story-views'),
  telegramStoryDelete: body('story-delete'),
  // Stealth mode, reactions list, report and fresh counts (R-Y199).
  telegramStoryStealth: body('story-stealth'),
  telegramStoryReactions: readBody('story-reactions'),
  telegramStoryReport: body('story-report'),
  telegramStoriesViews: readBody('stories-views'),
  telegramStoriesHide: body('stories-hide'),
  // Managing one's own stories (R-Y210): edit the caption or the audience,
  // and a story's t.me link.
  telegramStoryEdit: body('story-edit'),
  telegramStoryLink: readBody('story-link'),
  // Posting a story (R-Y156): whether the user may, then the upload's
  // token with the story's options → { ok } or { ok: false, code }.
  telegramStoryCanPost: readNone('story-can-post'),
  telegramStoryPost: body('story-post'),
  // Chat backgrounds (R-Y155): the list Telegram offers, a picture's
  // address, and one set for a chat (for the user only).
  telegramWallpapers: readBody('wallpapers'),
  telegramChatWallpaperSet: body('chat-wallpaper-set'),
  // Telegram Business: quick replies, greeting and away messages (R-Y179).
  telegramQuickReplies: readNone('quick-replies'),
  telegramQuickReplyMessages: readBody('quick-reply-messages'),
  telegramQuickReplyCreate: body('quick-reply-create'),
  telegramQuickReplyAdd: body('quick-reply-add'),
  telegramQuickReplyEdit: body('quick-reply-edit'),
  telegramQuickReplyDeleteMessages: body('quick-reply-delete-messages'),
  telegramQuickReplyRename: body('quick-reply-rename'),
  telegramQuickReplyDelete: body('quick-reply-delete'),
  telegramQuickReplyReorder: body('quick-reply-reorder'),
  telegramQuickReplySend: body('quick-reply-send'),
  telegramBusinessMessages: readNone('business-messages'),
  telegramBusinessGreetingSave: body('business-greeting-save'),
  telegramBusinessAwaySave: body('business-away-save'),
  // Notification sounds (R-Y181): the saved ringtones, one added from an
  // upload's token, one removed, and the audio's address.
  telegramRingtones: readNone('ringtones'),
  telegramRingtoneAdd: body('ringtone-add'),
  telegramRingtoneRemove: body('ringtone-remove'),
  // The user's own profile (R-Y136).
  telegramProfile: readNone('profile'),
  telegramProfileSave: body('profile-save'),
  telegramUsernameCheck: readBody('username-check'),
  telegramUsernameSave: body('username-save'),
  telegramProfilePhoto: body('profile-photo'),
  // Privacy and security (R-Y139).
  telegramPrivacy: readNone('privacy'),
  telegramPrivacySet: body('privacy-set'),
  telegramAuthorizations: readNone('sessions'),
  telegramSessionTerminate: body('session-terminate'),
  telegramSessionsTerminateOthers: none('sessions-terminate-others'),
  // Two-step verification, self-destruct, sensitive content and per-session
  // settings (R-Y177).
  telegramSecurity: readNone('security'),
  telegramPasswordSet: body('password-set'),
  telegramPasswordRemove: body('password-remove'),
  telegramPasswordEmailConfirm: body('password-email-confirm'),
  telegramPasswordEmailResend: none('password-email-resend'),
  telegramPasswordEmailCancel: none('password-email-cancel'),
  telegramAccountTtlSet: body('account-ttl-set'),
  telegramSensitiveSet: body('sensitive-set'),
  telegramSessionSettings: body('session-settings'),
  telegramSessionTtlSet: body('session-ttl-set'),
  // Login email, password reset and recovery, passkeys, sign-in codes
  // (R-Y218).
  telegramLoginEmailSend: body('login-email-send'),
  telegramLoginEmailVerify: body('login-email-verify'),
  telegramRecoveryRequest: none('recovery-request'),
  telegramRecoveryConfirm: body('recovery-confirm'),
  telegramPasswordReset: none('password-reset'),
  telegramPasswordResetCancel: none('password-reset-cancel'),
  telegramPasskeys: readNone('passkeys'),
  telegramPasskeyOptions: none('passkey-options'),
  telegramPasskeyRegister: body('passkey-register'),
  telegramPasskeyDelete: body('passkey-delete'),
  telegramSignInCodes: readNone('sign-in-codes'),
  telegramInvalidateCodes: body('invalidate-codes'),
  telegramBlocked: readBody('blocked'),
  telegramUnblock: body('unblock'),
  // A group's members ({ chat, q, offset, limit }) and one removed
  // ({ chat, user }) (R-Y125).
  telegramMembers: readBody('members'),
  telegramMemberRemove: body('member-remove'),
  // Delete all from a member, anti-spam false positives, a broadcast group,
  // ownership and the channels left (R-Y200).
  telegramModerateUser: body('moderate-user'),
  telegramNotSpam: body('not-spam'),
  telegramConvertGigagroup: body('convert-gigagroup'),
  telegramTransferOwnership: body('transfer-ownership'),
  telegramLeftChannels: readBody('left-channels'),
  // Block, contacts and report (R-Y128).
  telegramPeerBlock: body('peer-block'),
  telegramPeerContact: body('peer-contact'),
  telegramPeerReport: body('peer-report'),
  telegramPeerReportSpam: body('peer-report-spam'),
  // The bar over a chat with a stranger (R-Y137).
  // The message effects Telegram offers (R-Y149).
  telegramEffects: readBody('effects'),
  // Emoji statuses (R-Y162).
  telegramEmojiStatuses: readBody('emoji-statuses'),
  telegramEmojiStatusSet: body('emoji-status-set'),
  // Settings → Stickers and emoji, close friends, a contact by phone (R-Y169).
  telegramStickerSets: readBody('sticker-sets'),
  telegramStickerSetsReorder: body('sticker-sets-reorder'),
  telegramStickerSetArchive: body('sticker-set-archive'),
  telegramStickerSetRemove: body('sticker-set-remove'),
  telegramStickerSetAdd: body('sticker-set-add'),
  telegramStickerSetsArchived: readBody('sticker-sets-archived'),
  telegramCloseFriends: readBody('close-friends'),
  telegramCloseFriendsSet: body('close-friends-set'),
  telegramContactImport: body('contact-import'),
  // Cloud themes, a theme's link, recording the theme, and "Do not
  // translate this chat" (R-Y209).
  telegramCloudThemes: readBody('cloud-themes'),
  telegramCloudTheme: readBody('cloud-theme'),
  telegramCloudThemeInstall: body('cloud-theme-install'),
  telegramTranslationsToggle: body('translations-toggle'),
  // Chat themes and several usernames (R-Y170).
  telegramChatThemes: readBody('chat-themes'),
  telegramChatThemeSet: body('chat-theme-set'),
  telegramUsernameToggle: body('username-toggle'),
  telegramUsernamesReorder: body('usernames-reorder'),
  telegramSendAs: readBody('send-as'),
  telegramSendAsSave: body('send-as-save'),
  // The recent calls list (R-Y163).
  telegramCalls: readBody('calls'),
  telegramNotifySettings: readNone('notify-settings'),
  telegramNotifySettingsSet: body('notify-settings-set'),
  telegramNotifyChat: body('notify-chat'),
  telegramCommonChats: readBody('common-chats'),
  // Statistics of a channel or supergroup (R-Y167).
  telegramChatStats: readBody('chat-stats'),
  telegramStatsGraph: readBody('stats-graph'),
  // The pinned messages list, similar channels, fact checks (R-Y166).
  telegramPinnedList: readBody('pinned-list'),
  telegramUnpinAll: body('unpin-all'),
  telegramSimilarChannels: readBody('similar-channels'),
  telegramSimilarJoin: body('similar-join'),
  // Popular mini apps, similar bots, prepared messages, collectibles (R-Y194).
  telegramAppsPopular: readBody('apps-popular'),
  telegramBotSimilar: readBody('bot-similar'),
  telegramPreparedMessage: readBody('prepared-message'),
  telegramCollectibleInfo: readBody('collectible-info'),
  telegramFactChecks: readBody('fact-checks'),
  // A hashtag's messages and the live counters of posts (R-Y182).
  telegramSearchTag: readBody('search-tag'),
  telegramMessageViews: body('message-views'),
  telegramNotifyChatSet: body('notify-chat-set'),
  telegramPeerSettings: readBody('peer-settings'),
  telegramPeerHideBar: body('peer-hide-bar'),
  telegramPeerShareContact: body('peer-share-contact'),
  telegramGifSearch: readBody('gif-search'),
  // The panel's menu ({ id, action }; R-Y115).
  telegramStickerSave: body('sticker-save'),
  telegramStickerSetBox: readBody('sticker-set-box'),
  // A die's animations ({ emoticon }; R-Y130).
  telegramDice: readBody('dice'),
  telegramStickerSetInstall: body('sticker-set-install'),
  telegramSendDocument: body('send-document'),
  // A chat's scheduled messages (R-Y102): { chat } → { ok, links };
  // sent now, deleted ({ chat, ids }), moved ({ chat, id, date }).
  telegramScheduled: readBody('scheduled'),
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
  telegramExportDefaults: readNone('export-defaults'),
  telegramExportStart: body('export-start'),
  telegramExportStatus: readNone('export-status'),
  telegramExportCancel: none('export-cancel'),
  telegramExportReveal: none('export-reveal'),
  // Paid messages (R-Y184): what a message costs in a chat ({ chat } →
  // { stars }), the price charged to non-contacts and its save ({ stars }),
  // what one person paid ({ user }), letting them write free or pay again
  // ({ user, allow, refund? }), a group's price ({ chat, stars }).
  telegramPaidPrice: readBody('paid-price'),
  telegramPaidSettings: readNone('paid-settings'),
  telegramPaidSettingsSave: body('paid-settings-save'),
  telegramPaidRevenue: readBody('paid-revenue'),
  telegramPaidException: body('paid-exception'),
  telegramPaidPriceSave: body('paid-price-save'),
  // A giveaway's details ({ chat, id, channels?, winners? }; R-Y184).
  telegramGiveawayInfo: readBody('giveaway-info'),
  // The connection proxy (R-Y192): read it (never the password or secret),
  // save it, and a short TCP check of its address.
  telegramProxyGet: readNone('proxy-get'),
  telegramProxySave: body('proxy-save'),
  telegramProxyCheck: readBody('proxy-check'),
  // Channel direct messages and suggested posts (R-Y191): a monoforum's
  // threads ({ chat }), a thread ({ chat, peer?, before? }), a message
  // ({ chat, text, peer?, stars?, suggestedPost? }), a decision ({ chat,
  // id, approve, scheduleDate?, comment? }).
  telegramChannelDmThreads: readBody('channel-dm-threads'),
  telegramChannelDmHistory: readBody('channel-dm-history'),
  telegramChannelDmSend: body('channel-dm-send'),
  telegramChannelDmDecide: body('channel-dm-decide'),
  // Bot login links and attachment-menu bots (R-Y201).
  telegramBotUrlAuth: readBody('bot-url-auth'),
  telegramBotUrlAccept: body('bot-url-accept'),
  telegramUrlAuthDomains: readNone('url-auth-domains'),
  telegramAttachMenuBots: readNone('attach-menu-bots'),
  telegramAttachMenuBot: readBody('attach-menu-bot'),
  telegramAttachMenuToggle: body('attach-menu-toggle'),
  // Adding members and administrators (R-Y204): who can be added ({ chat }),
  // adding ({ chat, users }), sending the invite link to those who could
  // not be added ({ chat, users }), the administrators ({ chat }), one made
  // or dismissed ({ chat, user, rights?, rank?, dismiss?, broadcast? }), the
  // history new members see ({ chat, hidden }) and upgrading a basic group
  // to a supergroup ({ chat }).
  telegramAddCandidates: readBody('chat-add-candidates'),
  telegramMembersAdd: body('members-add'),
  telegramMembersInviteLink: body('members-invite-link'),
  telegramChatAdmins: readBody('chat-admins'),
  telegramAdminSet: body('admin-set'),
  telegramHistoryHidden: body('history-hidden'),
  telegramGroupUpgrade: body('group-upgrade'),
  // Sticker and emoji extras (R-Y206): the trending sets ({ emojis?, old?,
  // offset? }) and those seen ({ ids }), the recent stickers cleared, the
  // sets used in a photo or video ({ chat, id }), the quick reaction and a
  // new one ({ emoji }), and custom emoji found by words ({ q }).
  telegramStickerFeatured: readBody('sticker-featured'),
  telegramStickerFeaturedRead: body('sticker-featured-read'),
  telegramStickerRecentClear: none('sticker-recent-clear'),
  telegramStickerAttached: readBody('sticker-attached'),
  telegramQuickReaction: readNone('quick-reaction'),
  telegramQuickReactionSet: body('quick-reaction-set'),
  telegramCustomEmojiSearch: readBody('custom-emoji-search'),
  // The emoji panel's Premium flag and category groups (R-Y214).
  telegramEmojiPanelInfo: readBody('emoji-panel-info'),
};
