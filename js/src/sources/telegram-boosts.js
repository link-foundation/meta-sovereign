/**
 * Channel boosts, as Telegram Desktop has them (R-Y173; learned, never
 * copied): a channel or supergroup has a boost level that Premium users
 * raise by giving it one of their boost slots.
 * - `boostsStatus({ chat })` — premium.getBoostsStatus → `{ ok, level,
 *   boosts, giftBoosts, currentLevelBoosts, nextLevelBoosts (null at the
 *   top), url, mine }` (`mine`: the user already boosts it);
 * - `myBoosts({ chat })` — premium.getMyBoosts → `{ ok, premium, slots:
 *   [{ slot, chat (marked id or null), title, expires, cooldownUntil }] }`
 *   (dates are unix seconds, 0 when none); an account without Premium has
 *   no slots;
 * - `boostApply({ chat, slot })` — premium.applyBoost with that one slot,
 *   a WRITE made only on the user's click → `{ ok, slots }`;
 * - `boostersList({ chat, offset? })` — premium.getBoostsList, for admins,
 *   a page of 50 → `{ ok, count, boosters: [{ user, name, date, expires,
 *   multiplier, gift, giveaway }], next }`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const BOOSTERS_PAGE = 50;

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  BOOST_NOT_MODIFIED: 'already',
  PEER_ID_INVALID: 'no-chat',
  CHANNEL_INVALID: 'no-chat',
  BOOSTS_EMPTY: 'premium',
  CHAT_ADMIN_REQUIRED: 'admin',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHANNEL = /^-100\d{1,20}$/;
const text = (value) => String(value?.value ?? value ?? '');
const whole = (n) => Number(n ?? 0) || 0;

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  (user?.username ? `@${user.username}` : '');

/** Telegram's boosts status as the page's. */
export const statusOf = (s) => ({
  level: whole(s?.level),
  boosts: whole(s?.boosts),
  giftBoosts: whole(s?.giftBoosts),
  currentLevelBoosts: whole(s?.currentLevelBoosts),
  nextLevelBoosts:
    s?.nextLevelBoosts === undefined ? null : whole(s.nextLevelBoosts),
  url: String(s?.boostUrl ?? ''),
  mine: Boolean(s?.myBoost),
});

// A peer as the page's marked chat id.
const markedOf = (peer) => {
  if (peer?.className === 'PeerChannel') {
    return `-100${text(peer.channelId)}`;
  }
  return peer?.className === 'PeerChat' ? `-${text(peer.chatId)}` : null;
};

/** The user's boost slots from premium.myBoosts. */
export const slotsOf = (answer) => {
  const titles = new Map(
    (answer?.chats ?? []).map((chat) => [
      text(chat.id),
      String(chat.title ?? ''),
    ])
  );
  return (answer?.myBoosts ?? []).map((boost) => {
    const chat = markedOf(boost.peer);
    const id = text(boost.peer?.channelId ?? boost.peer?.chatId);
    return {
      slot: whole(boost.slot),
      chat,
      title: chat ? (titles.get(id) ?? '') : '',
      expires: whole(boost.expires),
      cooldownUntil: whole(boost.cooldownUntilDate),
    };
  });
};

/** Telegram's boosters list as the page's. */
export const boostersOf = (answer) => {
  const users = new Map((answer?.users ?? []).map((u) => [text(u.id), u]));
  return (answer?.boosts ?? []).map((b) => ({
    user: b.userId === undefined ? null : text(b.userId),
    name: nameOf(users.get(text(b.userId))),
    date: whole(b.date),
    expires: whole(b.expires),
    multiplier: Math.max(1, whole(b.multiplier)),
    gift: Boolean(b.gift),
    giveaway: Boolean(b.giveaway),
  }));
};

export const createBoosts = (env, { userClient }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const withChat = (c, chat, use) =>
    env.connection.withPeer(c.client, chat, use);

  const boostsStatus = async ({ chat } = {}) =>
    !CHANNEL.test(String(chat ?? ''))
      ? BAD
      : doing(`boosts:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => ({
            ok: true,
            ...statusOf(
              await c.client.invoke(new c.Api.premium.GetBoostsStatus({ peer }))
            ),
          }))
        );

  const myBoosts = async ({ chat } = {}) =>
    !CHANNEL.test(String(chat ?? ''))
      ? BAD
      : doing('my-boosts', async (c) => {
          const answer = await c.client.invoke(new c.Api.premium.GetMyBoosts());
          const me = await c.client.getMe?.().catch(() => null);
          return {
            ok: true,
            premium: Boolean(me?.premium),
            slots: slotsOf(answer),
          };
        });

  const boostApply = async ({ chat, slot } = {}) =>
    !CHANNEL.test(String(chat ?? '')) || !Number.isInteger(slot) || slot < 1
      ? BAD
      : doing(`boost-apply:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => ({
            ok: true,
            slots: slotsOf(
              await c.client.invoke(
                new c.Api.premium.ApplyBoost({ slots: [slot], peer })
              )
            ),
          }))
        );

  const boostersList = async ({ chat, offset = '' } = {}) =>
    !CHANNEL.test(String(chat ?? '')) ||
    typeof offset !== 'string' ||
    offset.length > 200
      ? BAD
      : doing(`boosters:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            const answer = await c.client.invoke(
              new c.Api.premium.GetBoostsList({
                peer,
                offset,
                limit: BOOSTERS_PAGE,
              })
            );
            return {
              ok: true,
              count: whole(answer?.count),
              boosters: boostersOf(answer),
              next: answer?.nextOffset ? String(answer.nextOffset) : null,
            };
          })
        );

  return { boostsStatus, myBoosts, boostApply, boostersList };
};
