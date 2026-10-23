// A forum seen as messages or as topics (R-Y171): the route of the POSTS
// table in routes-telegram.js, validated strictly before the account is
// asked.
//
// Its routes:
//   POST /api/telegram/forum-view {chat, asMessages} -> { ok, asMessages }
//                       channels.toggleViewForumAsMessages, made only on
//                       the user's click

const CHANNEL = /^-100\d{1,15}$/;

export const FORUM_VIEW_POSTS = {
  'forum-view': async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    typeof body.asMessages === 'boolean' &&
    typeof account.forumView === 'function'
      ? [
          200,
          await account.forumView({
            chat: String(body.chat),
            asMessages: body.asMessages,
          }),
        ]
      : [400, { error: 'chat and asMessages required', code: 'bad-request' }],
};
