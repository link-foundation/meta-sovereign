// Private one-to-one voice calls (R-Y196): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is
// asked. A call is placed, accepted, declined or ended only by a click in
// the page; the call itself is followed through the live link
// `phonecall:telegram`, which carries the emoji of the key and never the key.
//
// Its routes:
//   POST /api/telegram/private-call-start {user, name?} -> { ok, callId }
//                       "Call" in a private chat's header (user: the
//                       person's id)
//   POST /api/telegram/private-call-accept {id} -> { ok, callId } Accept
//   POST /api/telegram/private-call-discard {id, reason?} -> { ok,
//                       duration } Decline, End or the ring timeout; reason
//                       hangup (default), missed, busy or disconnect
//   POST /api/telegram/private-call-rate {id, rating, comment?} -> { ok }
//                       the rating dialog after a call (rating 1 to 5)
//   POST /api/telegram/private-call-state {} -> { ok, call } the call's
//                       view now, or null

import {
  validCallId,
  validDiscard,
  validRating,
  validStart,
} from '../sources/telegram-private-call.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];

const through = (name, valid) => async (account, body) =>
  valid(body) && typeof account[name] === 'function'
    ? [200, await account[name](body)]
    : BAD;

export const PRIVATE_CALL_POSTS = {
  'private-call-start': through('privateCallStart', validStart),
  'private-call-accept': through('privateCallAccept', validCallId),
  'private-call-discard': through('privateCallDiscard', validDiscard),
  'private-call-rate': through('privateCallRate', validRating),
  'private-call-state': through(
    'privateCallState',
    (body) => Object.keys(body ?? {}).length === 0
  ),
};
