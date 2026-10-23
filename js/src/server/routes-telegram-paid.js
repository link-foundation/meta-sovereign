// Paid messages and giveaways (R-Y184): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// Sends into a paid chat are not here: they are the usual send routes, each
// taking `allowPaidStars` (see `paidField` in telegram-send-as-client.js).
//
// Its routes:
//   POST /api/telegram/paid-price {chat} -> { ok, stars } what one message
//                       costs the user in a person's or a supergroup's chat
//                       (0: free); read only
//   POST /api/telegram/paid-settings {} -> { ok, stars } the price charged
//                       to non-contacts (0: none); read only
//   POST /api/telegram/paid-settings-save {stars} -> { ok, stars } sets that
//                       price (0..10000, 0 removes it), the user's other
//                       privacy settings kept; on Save only
//   POST /api/telegram/paid-revenue {user} -> { ok, stars } earned from one
//                       person; read only
//   POST /api/telegram/paid-exception {user, allow, refund?} -> { ok } lets
//                       a person write for free (allow true, refund true
//                       gives back what they paid) or makes them pay again
//                       (allow false); on a confirmation only
//   POST /api/telegram/paid-price-save {chat, stars} -> { ok, stars } the
//                       price of a supergroup's messages, 0 turns it off;
//                       on Save only
//   POST /api/telegram/giveaway-info {chat, id, channels?, winners?} ->
//                       { ok, ended, … } payments.getGiveawayInfo of a
//                       giveaway message, with names of the ids given;
//                       read only

import { validPrice } from '../sources/telegram-paid-messages.js';
import { validIds } from '../sources/telegram-giveaways.js';

const USER = /^\d{1,20}$/;
const CHANNEL = /^-100\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const BAD = [400, { error: 'invalid request', code: 'bad-request' }];

const route = (name, valid, args) => async (account, body) =>
  valid(body) && typeof account[name] === 'function'
    ? [200, await account[name](args(body))]
    : BAD;

export const PAID_POSTS = {
  'paid-price': route(
    'paidPrice',
    (b) => CHAT.test(String(b.chat ?? '')),
    (b) => ({ chat: String(b.chat) })
  ),
  'paid-settings': route(
    'paidSettings',
    () => true,
    () => ({})
  ),
  'paid-settings-save': route(
    'paidSettingsSave',
    (b) => validPrice(b.stars),
    (b) => ({ stars: b.stars })
  ),
  'paid-revenue': route(
    'paidRevenue',
    (b) => USER.test(String(b.user ?? '')),
    (b) => ({ user: String(b.user) })
  ),
  'paid-exception': route(
    'paidException',
    (b) =>
      USER.test(String(b.user ?? '')) &&
      typeof b.allow === 'boolean' &&
      (b.refund === undefined || typeof b.refund === 'boolean'),
    (b) => ({ user: String(b.user), allow: b.allow, refund: b.refund })
  ),
  'paid-price-save': route(
    'paidPriceSave',
    (b) => CHANNEL.test(String(b.chat ?? '')) && validPrice(b.stars),
    (b) => ({ chat: String(b.chat), stars: b.stars })
  ),
  'giveaway-info': route(
    'giveawayInfo',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      Number.isInteger(b.id) &&
      b.id > 0 &&
      validIds(b.channels) &&
      validIds(b.winners),
    (b) => ({
      chat: String(b.chat),
      id: b.id,
      channels: b.channels,
      winners: b.winners,
    })
  ),
};
