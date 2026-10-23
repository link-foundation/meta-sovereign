// Saved GIFs from a chat's message menu (R-Y171): the route of the POSTS
// table in routes-telegram.js, validated strictly before the account is
// asked.
//
// Its routes:
//   POST /api/telegram/gif-save {chat, message, unsave?} -> { ok, id,
//                       saved } the message's GIF saved to the user's GIFs
//                       or (unsave true) removed from them

const CHAT = /^-?\d{1,20}$/;

export const SAVED_GIFS_POSTS = {
  'gif-save': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    Number.isInteger(body.message) &&
    body.message > 0 &&
    (body.unsave === undefined || typeof body.unsave === 'boolean') &&
    typeof account.messageGifSave === 'function'
      ? [
          200,
          await account.messageGifSave({
            chat: String(body.chat),
            message: body.message,
            unsave: body.unsave === true,
          }),
        ]
      : [400, { error: 'chat and message required', code: 'bad-request' }],
};
