/**
 * The rest of Telegram Desktop's statistics views (R-Y195; learned, never
 * copied), added to the actions of ./telegram-stats.js:
 * - `messageStats({ chat, id })` — a channel post's views and reactions
 *   graphs (stats.getMessageStats) → `{ ok, graphs: [{ key, graph }] }`;
 * - `publicForwards({ chat, id, offset? })` — the public channels that
 *   shared the post, a page at a time (stats.getMessagePublicForwards) →
 *   `{ ok, count, items: [{ kind, name, chat?, id?, username?, views?,
 *   date? }], next }`, `next` the offset of the following page or null;
 * - `starsRevenue({ chat })` — the Stars a channel (-100…) or a bot (a user
 *   id) earned: the revenue graph, the balances and the USD rate
 *   (payments.getStarsRevenueStats) → `{ ok, graph, topHours?, status:
 *   { current, available, overall, withdrawalEnabled }, usdRate }`; the
 *   graph may come as a token (`stats.loadAsyncGraph`, the stats-graph
 *   route). Withdrawing is not offered here.
 * Read-only. Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'no-access',
  BROADCAST_REQUIRED: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  MESSAGE_ID_INVALID: 'not-found',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad request', code: 'failed' };
const noAccess = { ok: false, error: 'no access', code: 'no-access' };
const CHANNEL = /^-100\d{1,15}$/;
const USER = /^\d{1,15}$/;
const OFFSET_MAX = 512;
export const FORWARDS_PAGE = 20;
const SNIPPET = 90;

const num = (value) => Number(value?.value ?? value) || 0;
const textOf = (value) => String(value?.value ?? value);

/** A StarsAmount (`amount` + `nanos`) as a number of Stars. */
export const starsOf = (amount) =>
  num(amount?.amount) + (Number(amount?.nanos) || 0) / 1e9;

const nameOf = (chat) =>
  chat?.title ||
  [chat?.firstName, chat?.lastName].filter(Boolean).join(' ') ||
  chat?.username ||
  '';

const snippetOf = (text) => {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > SNIPPET ? `${clean.slice(0, SNIPPET)}…` : clean;
};

// One public forward: a channel's post (with a link's parts) or a story.
const forwardOf = (one, chats) => {
  const peer = one.className === 'PublicForwardMessage' ? one.message : one;
  const id = textOf(peer.peerId?.channelId ?? peer.peer?.channelId ?? '');
  const chat = chats.get(id);
  const name = nameOf(chat) || id;
  if (one.className !== 'PublicForwardMessage') {
    return { kind: 'story', name, ...(id ? { chat: `-100${id}` } : {}) };
  }
  const message = one.message;
  return {
    kind: 'message',
    name,
    chat: `-100${id}`,
    id: num(message.id),
    views: num(message.views),
    date: num(message.date),
    text: snippetOf(message.message),
    ...(chat?.username ? { username: String(chat.username) } : {}),
  };
};

const statusOf = (status = {}) => ({
  current: starsOf(status.currentBalance),
  available: starsOf(status.availableBalance),
  overall: starsOf(status.overallRevenue),
  withdrawalEnabled: Boolean(status.withdrawalEnabled),
});

export const createStatsMore = (
  env,
  context,
  { access, invokeOn, dcs, graphOf }
) => {
  const messageStats = async (body = {}) => {
    const chat = String(body.chat ?? '');
    const id = Number(body.id);
    if (!CHANNEL.test(chat) || !Number.isInteger(id) || id <= 0) {
      return bad;
    }
    return connected(env, context.userClient, failure, (c) =>
      runIn(env, `message-stats:${chat}:${id}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          const may = await access(c, chat, peer);
          if (!may?.broadcast) {
            return noAccess;
          }
          const stats = await invokeOn(
            c,
            chat,
            () => new c.Api.stats.GetMessageStats({ channel: peer, msgId: id })
          );
          const graphs = [
            { key: 'views', graph: graphOf(stats.viewsGraph) },
            { key: 'reactions', graph: graphOf(stats.reactionsByEmotionGraph) },
          ].filter((one) => one.graph);
          return { ok: true, graphs };
        })
      )
    );
  };

  const publicForwards = async (body = {}) => {
    const chat = String(body.chat ?? '');
    const id = Number(body.id);
    const offset = String(body.offset ?? '');
    if (
      !CHANNEL.test(chat) ||
      !Number.isInteger(id) ||
      id <= 0 ||
      offset.length > OFFSET_MAX
    ) {
      return bad;
    }
    return connected(env, context.userClient, failure, (c) =>
      runIn(env, `public-forwards:${chat}:${id}:${offset}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          if (!dcs.has(chat) && !(await access(c, chat, peer))) {
            return noAccess;
          }
          const answer = await invokeOn(
            c,
            chat,
            () =>
              new c.Api.stats.GetMessagePublicForwards({
                channel: peer,
                msgId: id,
                offset,
                limit: FORWARDS_PAGE,
              })
          );
          const chats = new Map(
            (answer.chats ?? []).map((one) => [textOf(one.id), one])
          );
          const items = (answer.forwards ?? []).map((one) =>
            forwardOf(one, chats)
          );
          return {
            ok: true,
            count: num(answer.count) || items.length,
            items,
            next: answer.nextOffset || null,
          };
        })
      )
    );
  };

  // May the user see the Stars revenue: a channel's or a bot's own flag.
  const mayView = async (c, chat, peer) => {
    if (CHANNEL.test(chat)) {
      const result = await c.client.invoke(
        new c.Api.channels.GetFullChannel({ channel: peer })
      );
      dcs.set(chat, Number(result.fullChat?.statsDc) || 0);
      return Boolean(result.fullChat?.canViewStarsRevenue);
    }
    const result = await c.client.invoke(
      new c.Api.users.GetFullUser({
        id: new c.Api.InputUser({
          userId: peer.userId ?? c.helpers.returnBigInt(chat),
          accessHash: peer.accessHash ?? c.helpers.returnBigInt('0'),
        }),
      })
    );
    dcs.set(chat, 0);
    return Boolean((result.fullUser ?? result).canViewRevenue);
  };

  const starsRevenue = async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat) && !USER.test(chat)) {
      return bad;
    }
    return connected(env, context.userClient, failure, (c) =>
      runIn(env, `stars-revenue:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          if (!(await mayView(c, chat, peer))) {
            return noAccess;
          }
          const stats = await invokeOn(
            c,
            chat,
            () => new c.Api.payments.GetStarsRevenueStats({ peer })
          );
          return {
            ok: true,
            graph: graphOf(stats.revenueGraph),
            ...(stats.topHoursGraph
              ? { topHours: graphOf(stats.topHoursGraph) }
              : {}),
            status: statusOf(stats.status),
            usdRate: num(stats.usdRate),
          };
        })
      )
    );
  };

  return { messageStats, publicForwards, starsRevenue };
};
