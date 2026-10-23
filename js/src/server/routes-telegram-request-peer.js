// A bot's "request peer" buttons and a chat's recent places (R-Y208).
//
// Its routes:
//   POST /api/telegram/request-peer-candidates {type} -> { ok, candidates:
//                       [{ id, name, username }] } the chats and people
//                       that satisfy the button's constraints; `type` is
//                       { kind: 'user'|'chat'|'broadcast', bot?, premium?,
//                       creator?, hasUsername?, forum?, userAdminRights? }
//   POST /api/telegram/request-peer-send {chat, msgId, buttonId, peers}
//                       -> { ok } answers the button with up to ten chat ids
//   POST /api/telegram/recent-locations {chat} -> { ok, places: [{ id, lat,
//                       lon, date, title, address }] } newest first

import { validPeers, validType } from '../sources/telegram-request-peer.js';

const CHAT = /^-?\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];

export const REQUEST_PEER_POSTS = {
  'request-peer-candidates': async (account, body) =>
    validType(body.type) && typeof account.requestPeerCandidates === 'function'
      ? [200, await account.requestPeerCandidates({ type: body.type })]
      : bad('type required'),
  'request-peer-send': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    Number.isInteger(body.msgId) &&
    body.msgId > 0 &&
    Number.isInteger(body.buttonId) &&
    validPeers(body.peers) &&
    typeof account.sendRequestedPeers === 'function'
      ? [
          200,
          await account.sendRequestedPeers({
            chat: body.chat,
            msgId: body.msgId,
            buttonId: body.buttonId,
            peers: body.peers,
          }),
        ]
      : bad('chat, msgId, buttonId and peers required'),
  'recent-locations': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    typeof account.recentLocations === 'function'
      ? [200, await account.recentLocations({ chat: body.chat })]
      : bad('chat required'),
};
