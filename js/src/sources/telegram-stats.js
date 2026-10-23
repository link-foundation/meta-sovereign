/**
 * Statistics of a channel or a big supergroup, as Telegram Desktop's
 * "Statistics" shows them to its admins (R-Y167; learned, never copied):
 * - `chatStats({ chat })` — a channel's overview (followers, views, shares
 *   and reactions per post, enabled notifications), its graphs and its
 *   recent posts (stats.getBroadcastStats), or a supergroup's overview
 *   (members, messages, viewing and posting members), graphs, top posters,
 *   top admins and top inviters (stats.getMegagroupStats) →
 *   `{ ok, kind: 'broadcast' | 'megagroup', period: { from, to },
 *   overview: [{ key, current, previous }], notifications?: { part, total },
 *   graphs: [{ key, graph }], posts?, posters?, admins?, inviters? }`.
 * - `statsGraph({ chat, token, x? })` — a graph Telegram sent as a token,
 *   or the zoomed one (stats.loadAsyncGraph; `x` the clicked point, ms)
 *   → `{ ok, graph }`.
 * A `graph` is `{ json, zoom? }` (Telegram's chart JSON as text, `zoom` the
 * token that zooms into a day), `{ token }` (to load) or `{ error }`.
 *
 * Statistics live on the DC the full channel names (`stats_dc`). GramJS
 * sends a request to another DC through `client.invoke(request, dcId)`
 * (a borrowed sender, authorised by exporting the account's key); the DC
 * is learned from channels.getFullChannel, kept by chat, and when Telegram
 * still answers STATS_MIGRATE_X the request is asked again on DC X.
 * R-Y195 adds a post's statistics, public shares and Stars revenue
 * (./telegram-stats-more.js), and `statsGraph` also takes a bot's id.
 * Read-only. Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { createStatsMore } from './telegram-stats-more.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'no-access',
  BROADCAST_REQUIRED: 'no-access',
  MEGAGROUP_REQUIRED: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  GRAPH_OUTDATED_RELOAD: 'outdated',
  GRAPH_INVALID_RELOAD: 'outdated',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad request', code: 'failed' };
const noAccess = { ok: false, error: 'no access', code: 'no-access' };
const CHANNEL = /^-100\d{1,15}$/;
const DIGITS = /^\d{1,20}$/;
const BOT = /^\d{1,15}$/;
export const MAX_TOKEN = 1024;
export const POSTS_SHOWN = 20;
const SNIPPET = 90;

const BROADCAST_OVERVIEW = [
  ['followers', 'followers'],
  ['viewsPerPost', 'viewsPerPost'],
  ['sharesPerPost', 'sharesPerPost'],
  ['reactionsPerPost', 'reactionsPerPost'],
];
const BROADCAST_GRAPHS = [
  ['growth', 'growthGraph'],
  ['followers', 'followersGraph'],
  ['mute', 'muteGraph'],
  ['topHours', 'topHoursGraph'],
  ['interactions', 'interactionsGraph'],
  ['ivInteractions', 'ivInteractionsGraph'],
  ['viewsBySource', 'viewsBySourceGraph'],
  ['newFollowersBySource', 'newFollowersBySourceGraph'],
  ['languages', 'languagesGraph'],
  ['reactions', 'reactionsByEmotionGraph'],
];
const MEGAGROUP_OVERVIEW = [
  ['members', 'members'],
  ['messages', 'messages'],
  ['viewers', 'viewers'],
  ['posters', 'posters'],
];
const MEGAGROUP_GRAPHS = [
  ['growth', 'growthGraph'],
  ['members', 'membersGraph'],
  ['newMembersBySource', 'newMembersBySourceGraph'],
  ['languages', 'languagesGraph'],
  ['messages', 'messagesGraph'],
  ['actions', 'actionsGraph'],
  ['topHours', 'topHoursGraph'],
  ['weekdays', 'weekdaysGraph'],
];

const num = (value) => Number(value?.value ?? value) || 0;
const textOf = (value) => String(value?.value ?? value);

/** A StatsGraph as the page takes it: the JSON text, a token or an error. */
export const graphOf = (raw) => {
  switch (raw?.className) {
    case 'StatsGraph':
      return {
        json: String(raw.json?.data ?? ''),
        ...(raw.zoomToken ? { zoom: String(raw.zoomToken) } : {}),
      };
    case 'StatsGraphAsync':
      return { token: String(raw.token) };
    case 'StatsGraphError':
      return { error: String(raw.error ?? '') };
    default:
      return null;
  }
};

const overviewOf = (stats, keys) =>
  keys.map(([key, field]) => ({
    key,
    current: num(stats[field]?.current),
    previous: num(stats[field]?.previous),
  }));

const graphsOf = (stats, keys) =>
  keys
    .map(([key, field]) => ({ key, graph: graphOf(stats[field]) }))
    .filter((one) => one.graph);

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

// People in a top list: the user's id and name beside the figures.
const peopleOf = (list, users, pick) => {
  const byId = new Map((users ?? []).map((u) => [textOf(u.id), u]));
  return (list ?? []).map((one) => {
    const id = textOf(one.userId);
    return { id, name: nameOf(byId.get(id)) || id, ...pick(one) };
  });
};

const megagroupOf = (stats) => ({
  kind: 'megagroup',
  overview: overviewOf(stats, MEGAGROUP_OVERVIEW),
  graphs: graphsOf(stats, MEGAGROUP_GRAPHS),
  posters: peopleOf(stats.topPosters, stats.users, (one) => ({
    messages: num(one.messages),
    avgChars: num(one.avgChars),
  })),
  admins: peopleOf(stats.topAdmins, stats.users, (one) => ({
    deleted: num(one.deleted),
    kicked: num(one.kicked),
    banned: num(one.banned),
  })),
  inviters: peopleOf(stats.topInviters, stats.users, (one) => ({
    invitations: num(one.invitations),
  })),
});

const snippetOf = (message) => {
  const text = String(message?.message ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text;
};

// The latest posts' counters (not stories), newest first.
const postCounters = (stats) =>
  (stats.recentPostsInteractions ?? [])
    .filter((one) => one.className === 'PostInteractionCountersMessage')
    .sort((a, b) => num(b.msgId) - num(a.msgId))
    .slice(0, POSTS_SHOWN);

const postOf = (one, message) => ({
  id: num(one.msgId),
  views: num(one.views),
  forwards: num(one.forwards),
  reactions: num(one.reactions),
  text: snippetOf(message),
  media: Boolean(
    message?.media && message.media.className !== 'MessageMediaEmpty'
  ),
  ...(message?.date ? { date: num(message.date) } : {}),
});

export const createStats = (env, context) => {
  const dcs = new Map(); // chat -> the DC its statistics live on (0: ours)

  const send = (c, request, dc) =>
    dc && dc !== c.client.session?.dcId
      ? c.client.invoke(request, dc)
      : c.client.invoke(request);

  // Asks on the chat's stats DC; STATS_MIGRATE_X moves it to DC X.
  const invokeOn = async (c, chat, build) => {
    try {
      return await send(c, build(), dcs.get(chat) ?? 0);
    } catch (error) {
      const moved = /STATS_MIGRATE_(\d+)/.exec(
        String(error?.errorMessage ?? error?.message ?? '')
      );
      if (!moved) {
        throw error;
      }
      dcs.set(chat, Number(moved[1]));
      return send(c, build(), Number(moved[1]));
    }
  };

  // The full channel: may the user see statistics, which kind, on which DC.
  const access = async (c, chat, peer) => {
    const result = await c.client.invoke(
      new c.Api.channels.GetFullChannel({ channel: peer })
    );
    const full = result.fullChat ?? {};
    const entity =
      (result.chats ?? []).find((x) => textOf(x.id) === chat.slice(4)) ??
      (result.chats ?? []).find(Boolean) ??
      {};
    dcs.set(chat, Number(full.statsDc) || 0);
    return full.canViewStats ? { broadcast: Boolean(entity.broadcast) } : null;
  };

  const postsOf = async (c, peer, counters) => {
    if (counters.length === 0) {
      return [];
    }
    const answer = await c.client
      .invoke(
        new c.Api.channels.GetMessages({
          channel: peer,
          id: counters.map(
            (one) => new c.Api.InputMessageID({ id: num(one.msgId) })
          ),
        })
      )
      .catch(() => null);
    const byId = new Map((answer?.messages ?? []).map((m) => [num(m.id), m]));
    return counters.map((one) => postOf(one, byId.get(num(one.msgId))));
  };

  const broadcastOf = async (c, chat, peer) => {
    const stats = await invokeOn(
      c,
      chat,
      () => new c.Api.stats.GetBroadcastStats({ channel: peer })
    );
    return {
      stats,
      kind: 'broadcast',
      overview: overviewOf(stats, BROADCAST_OVERVIEW),
      notifications: {
        part: num(stats.enabledNotifications?.part),
        total: num(stats.enabledNotifications?.total),
      },
      graphs: graphsOf(stats, BROADCAST_GRAPHS),
      posts: await postsOf(c, peer, postCounters(stats)),
    };
  };

  const megagroupStats = async (c, chat, peer) => {
    const stats = await invokeOn(
      c,
      chat,
      () => new c.Api.stats.GetMegagroupStats({ channel: peer })
    );
    return { stats, ...megagroupOf(stats) };
  };

  const chatStats = async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat)) {
      return bad;
    }
    return connected(env, context.userClient, failure, (c) =>
      runIn(env, `stats:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          const may = await access(c, chat, peer);
          if (!may) {
            return noAccess;
          }
          const { stats, ...made } = may.broadcast
            ? await broadcastOf(c, chat, peer)
            : await megagroupStats(c, chat, peer);
          return {
            ok: true,
            ...made,
            period: {
              from: num(stats.period?.minDate),
              to: num(stats.period?.maxDate),
            },
          };
        })
      )
    );
  };

  const statsGraph = async (body = {}) => {
    const chat = String(body.chat ?? '');
    const token = body.token;
    const x = body.x === undefined ? undefined : String(body.x);
    if (
      !(CHANNEL.test(chat) || BOT.test(chat)) ||
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > MAX_TOKEN ||
      (x !== undefined && !DIGITS.test(x))
    ) {
      return bad;
    }
    return connected(env, context.userClient, failure, (c) =>
      runIn(env, `stats-graph:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          // A bot's statistics (its Stars revenue) are on our own DC.
          if (!CHANNEL.test(chat)) {
            dcs.set(chat, 0);
          } else if (!dcs.has(chat) && !(await access(c, chat, peer))) {
            return noAccess;
          }
          const result = await invokeOn(
            c,
            chat,
            () =>
              new c.Api.stats.LoadAsyncGraph({
                token,
                ...(x === undefined ? {} : { x: c.helpers.returnBigInt(x) }),
              })
          );
          const graph = graphOf(result);
          return graph ? { ok: true, graph } : failure(new Error('failed'));
        })
      )
    );
  };

  return {
    chatStats,
    statsGraph,
    // A post's statistics, its public shares, Stars revenue (R-Y195).
    ...createStatsMore(env, context, { access, invokeOn, dcs, graphOf }),
  };
};
