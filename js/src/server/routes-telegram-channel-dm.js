// Channel direct messages and suggested posts (R-Y191): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked. A write happens only on the page's own click.
//
// Its routes:
//   POST /api/telegram/channel-dm-threads {chat} -> { ok, threads } the
//                       admin's list of subscribers' threads of a
//                       monoforum (chat: -100N)
//   POST /api/telegram/channel-dm-history {chat, peer?, before?} -> { ok,
//                       messages, complete } a thread (peer: the
//                       subscriber, for an admin) or the subscriber's own
//   POST /api/telegram/channel-dm-send {chat, text, peer?, stars?,
//                       suggestedPost?: {stars, scheduleDate?}} -> { ok }
//                       a message into the monoforum; an admin's reply
//                       names the thread (peer); `stars` the price paid
//   POST /api/telegram/channel-dm-decide {chat, id, approve, scheduleDate?,
//                       comment?} -> { ok } accept or reject a suggested post

const MONOFORUM = /^-100\d{1,15}$/;
const USER = /^\d{1,20}$/;
const bad = [400, { error: 'invalid request', code: 'bad-request' }];

const count = (value, max) =>
  Number.isInteger(value) && value > 0 && value <= max;

const validChat = (body) => MONOFORUM.test(String(body.chat ?? ''));

const validPeer = (peer) => peer === undefined || USER.test(String(peer));

const validSuggested = (post) =>
  post === undefined ||
  (Boolean(post) &&
    typeof post === 'object' &&
    count(post.stars, 100_000_000) &&
    (post.scheduleDate === undefined ||
      count(post.scheduleDate, 4_000_000_000)));

const validSend = (body) =>
  typeof body.text === 'string' &&
  body.text.trim() !== '' &&
  body.text.length <= 4096 &&
  validPeer(body.peer) &&
  (body.stars === undefined || count(body.stars, 100_000)) &&
  validSuggested(body.suggestedPost);

const validDecide = (body) =>
  count(body.id, 2_147_483_647) &&
  typeof body.approve === 'boolean' &&
  (body.scheduleDate === undefined ||
    count(body.scheduleDate, 4_000_000_000)) &&
  (body.comment === undefined ||
    (typeof body.comment === 'string' && body.comment.length <= 500));

const run = (method, valid) => async (account, body) =>
  validChat(body) && valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](body)]
    : bad;

export const CHANNEL_DM_POSTS = {
  'channel-dm-threads': run('channelDmThreads', () => true),
  'channel-dm-history': run(
    'channelDmHistory',
    (body) =>
      validPeer(body.peer) &&
      (body.before === undefined || count(body.before, 2_147_483_647))
  ),
  'channel-dm-send': run('channelDmSend', validSend),
  'channel-dm-decide': run('channelDmDecide', validDecide),
};
