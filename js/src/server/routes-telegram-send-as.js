// "Send as" in a group (R-Y141): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/send-as {chat}  -> { ok, current, peers, premium }
//                                         who may send in a supergroup
//                                         and who does by default; send-
//                                         files, -voice, -document, -poll
//                                         and a message take `sendAs`
//                                         (a peer id) too (R-Y141)
//   POST /api/telegram/send-as-save {chat, sendAs}
//                                      -> { ok, current } the default
//                                         identity kept (R-Y141)

const SUPERGROUP = /^-100\d{1,15}$/;
const PEER = /^-?\d{1,20}$/;

const bad = [400, { error: 'chat required', code: 'bad-request' }];

export const SEND_AS_POSTS = {
  'send-as': async (account, body) =>
    SUPERGROUP.test(String(body.chat ?? '')) &&
    typeof account.sendAsList === 'function'
      ? [200, await account.sendAsList({ chat: body.chat })]
      : bad,
  'send-as-save': async (account, body) =>
    SUPERGROUP.test(String(body.chat ?? '')) &&
    typeof body.sendAs === 'string' &&
    PEER.test(body.sendAs) &&
    typeof account.sendAsSave === 'function'
      ? [
          200,
          await account.sendAsSave({ chat: body.chat, sendAs: body.sendAs }),
        ]
      : [400, { error: 'chat and sendAs required', code: 'bad-request' }],
};
