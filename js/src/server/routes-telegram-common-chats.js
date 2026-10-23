// Groups in common with a person (R-Y158): the route of the POSTS table in
// routes-telegram.js, validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/common-chats {chat, maxId?} -> { ok, chats: [{ chat,
//                       title, kind, members }], next } chat a person's
//                       id (digits); maxId the previous page's `next`

const USER = /^\d{1,20}$/;

export const COMMON_CHATS_POSTS = {
  'common-chats': async (account, body) =>
    USER.test(String(body.chat ?? '')) &&
    (body.maxId === undefined || USER.test(String(body.maxId))) &&
    typeof account.commonChats === 'function'
      ? [
          200,
          await account.commonChats({
            chat: body.chat,
            ...(body.maxId === undefined ? {} : { maxId: String(body.maxId) }),
          }),
        ]
      : [400, { error: 'chat required', code: 'bad-request' }],
};
