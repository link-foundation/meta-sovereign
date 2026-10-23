// Voice chats, video chats and live streams (R-Y188): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked. Joining, leaving, notifying and unmuting are writes
// and only ever follow a click in the page.
//
// Its routes:
//   POST /api/telegram/call-info {chat} -> { ok, call } the chat's active
//                       call or null (a group or channel id)
//   POST /api/telegram/call-open {id, accessHash} -> { ok, call,
//                       participants, next, count }
//   POST /api/telegram/call-participants {id, accessHash, offset?} ->
//                       { ok, participants, next, count } a further page
//   POST /api/telegram/call-notify {id, accessHash, subscribed} -> { ok }
//                       "Notify me" for a scheduled call
//   POST /api/telegram/call-join-as {chat} -> { ok, peers } who may join
//   POST /api/telegram/call-join {id, accessHash, params, joinAs?} ->
//                       { ok, connection, source } joins muted; `params`
//                       is the join params JSON as a string
//   POST /api/telegram/call-leave {id, accessHash, source} -> { ok }
//   POST /api/telegram/call-self {id, accessHash, muted, raiseHand?,
//                       joinAs?} -> { ok } our own mute / raised hand

import {
  validCall,
  validChat,
  validJoinAs,
  validParams,
} from '../sources/telegram-voice-chat.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];

const through = (name, valid) => async (account, body) =>
  valid(body) && typeof account[name] === 'function'
    ? [200, await account[name](body)]
    : BAD;

const offsetOk = (body) =>
  body.offset === undefined || /^[\w-]{0,200}$/.test(String(body.offset));

export const VOICE_CHAT_POSTS = {
  'call-info': through('callInfo', validChat),
  'call-open': through('callOpen', validCall),
  'call-participants': through(
    'callParticipants',
    (body) => validCall(body) && offsetOk(body)
  ),
  'call-notify': through(
    'callNotify',
    (body) => validCall(body) && typeof body.subscribed === 'boolean'
  ),
  'call-join-as': through('callJoinAs', validChat),
  'call-join': through(
    'callJoin',
    (body) =>
      validCall(body) && validParams(body.params) && validJoinAs(body.joinAs)
  ),
  'call-leave': through(
    'callLeave',
    (body) => validCall(body) && Number.isInteger(body.source)
  ),
  'call-self': through(
    'callSelf',
    (body) =>
      validCall(body) &&
      typeof body.muted === 'boolean' &&
      validJoinAs(body.joinAs) &&
      (body.raiseHand === undefined || typeof body.raiseHand === 'boolean')
  ),
};
