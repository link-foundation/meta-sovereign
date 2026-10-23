// The Contacts window's statuses and the read time of an outgoing message
// in a private chat (R-Y189): routes of the POSTS table in routes-telegram.js,
// validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/contact-statuses {} -> { ok, statuses: [{ id, online,
//                       lastSeen? }] } every contact's last seen
//   POST /api/telegram/message-read-time {chat, id} -> { ok, read, date?,
//                       code? } chat a person's id (digits), id the message's
//                       network id; `date` ms, null with a code
//                       (your-privacy, peer-privacy, too-old)

const USER = /^\d{1,20}$/;

export const CONTACTS_POSTS = {
  'contact-statuses': async (account) =>
    typeof account.contactStatuses === 'function'
      ? [200, await account.contactStatuses()]
      : [400, { error: 'unsupported', code: 'bad-request' }],
  'message-read-time': async (account, body) =>
    USER.test(String(body.chat ?? '')) &&
    Number.isInteger(body.id) &&
    body.id > 0 &&
    typeof account.messageReadTime === 'function'
      ? [
          200,
          await account.messageReadTime({
            chat: String(body.chat),
            id: body.id,
          }),
        ]
      : [400, { error: 'chat and id required', code: 'bad-request' }],
};
