// Statistics of channels and groups (R-Y167): Telegram's chart JSON turned
// into series and SVG shapes, the number, change and percentage formatting,
// the source with a fake client (the overview, the graphs by kind, the
// posts, the top lists, the stats DC and STATS_MIGRATE_X), the routes'
// strict validation and the page's pure helpers. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  MAX_TOKEN,
  createStats,
  graphOf,
} from '../src/sources/telegram-stats.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  changeOf,
  formatChange,
  formatCompact,
  formatNumber,
  formatPercent,
  isHourly,
  layoutGraph,
  nearestIndex,
  niceTicks,
  parseGraph,
  percentOf,
  shareRows,
  tooltipOf,
  xTickIndexes,
} from '../src/web/stats-graph.js';
import { hasStats } from '../src/web/chat-stats.js';

const DAY = 86_400_000;
const chart = (extra = {}) => ({
  columns: [
    ['x', 0, DAY, 2 * DAY, 3 * DAY],
    ['y0', 10, 20, 15, 30],
    ['y1', 5, 5, 10, 0],
  ],
  types: { x: 'x', y0: 'line', y1: 'line' },
  names: { y0: 'Joined', y1: 'Left' },
  colors: { y0: '#3497ed', y1: '#e65850' },
  ...extra,
});

test('chart JSON becomes series; bad input is refused', () => {
  const graph = parseGraph(JSON.stringify(chart()));
  assert.deepEqual(graph.xs, [0, DAY, 2 * DAY, 3 * DAY]);
  assert.equal(graph.series.length, 2);
  assert.equal(graph.series[0].name, 'Joined');
  assert.equal(graph.series[1].color, '#e65850');
  assert.equal(graph.kind, 'line');
  assert.equal(parseGraph('not json'), null);
  assert.equal(parseGraph({}), null);
  assert.equal(parseGraph({ columns: [['y0', 1]] }), null);
  assert.equal(
    parseGraph({
      columns: [
        ['x', 1, 2],
        ['y0', 1],
      ],
      types: { y0: 'line' },
    }),
    null,
    'ragged columns are dropped, leaving nothing'
  );
  assert.equal(
    parseGraph({
      columns: [
        ['x', 1],
        ['y0', 'a'],
      ],
      types: {},
    }),
    null
  );
  const odd = parseGraph(chart({ colors: { y0: 'red' } }));
  assert.match(odd.series[0].color, /^#/, 'a bad colour is replaced');
});

test('kinds: bar, area, share, stacked and percentage', () => {
  const bars = parseGraph(
    chart({ types: { x: 'x', y0: 'bar', y1: 'bar' }, stacked: true })
  );
  assert.equal(bars.kind, 'bar');
  assert.equal(bars.stacked, true);
  const area = parseGraph(
    chart({ types: { x: 'x', y0: 'area', y1: 'area' }, percentage: true })
  );
  assert.equal(area.kind, 'area');
  assert.equal(area.stacked, true, 'percentage implies stacked');
  const share = parseGraph({
    columns: [
      ['x', DAY],
      ['a', 30],
      ['b', 70],
    ],
    types: { x: 'x', a: 'area', b: 'area' },
    names: { a: 'Russian', b: 'English' },
  });
  assert.equal(share.kind, 'share');
  const rows = shareRows(share);
  assert.equal(rows[0].name, 'English');
  assert.equal(rows[0].percent, 70);
  assert.equal(shareRows(share, new Set(['b']))[0].percent, 100);
});

test('layout: line paths, hidden series, bars, stacked areas', () => {
  const graph = parseGraph(chart());
  const all = layoutGraph(graph);
  assert.equal(all.shapes.length, 2);
  assert.match(all.shapes[0].d, /^M[\d.]+,[\d.]+L/);
  const one = layoutGraph(graph, new Set(['y1']));
  assert.deepEqual(
    one.shapes.map((s) => s.id),
    ['y0']
  );
  // The top of the scale covers the largest value.
  assert.ok(one.yTicks.at(-1).v >= 30);
  assert.equal(all.xTicks.length, 4);

  const bars = layoutGraph(
    parseGraph(
      chart({ types: { x: 'x', y0: 'bar', y1: 'bar' }, stacked: true })
    )
  );
  assert.equal(bars.shapes[0].kind, 'bar');
  assert.equal(bars.shapes[0].rects.length, 4);
  // A stacked bar sits on the one beneath it.
  const [low, high] = bars.shapes.map((s) => s.rects[0]);
  assert.ok(high.y + high.h <= low.y + 0.01);

  const areas = layoutGraph(
    parseGraph(
      chart({ types: { x: 'x', y0: 'area', y1: 'area' }, stacked: true })
    )
  );
  assert.ok(areas.shapes.every((s) => s.d.endsWith('Z')));

  const pct = parseGraph(
    chart({ types: { x: 'x', y0: 'area', y1: 'area' }, percentage: true })
  );
  assert.equal(layoutGraph(pct).yTicks.at(-1).v, 100);
});

test('pointer positions, tooltips and tick helpers', () => {
  const graph = parseGraph(chart());
  assert.equal(nearestIndex(graph, 0), 0);
  assert.equal(nearestIndex(graph, 1), 3);
  assert.equal(nearestIndex(graph, 0.4), 1);
  assert.equal(nearestIndex(graph, 99), 3);
  assert.equal(nearestIndex(graph, 'x'), 0);
  const tip = tooltipOf(graph, 2);
  assert.equal(tip.ms, 2 * DAY);
  assert.deepEqual(
    tip.rows.map((r) => [r.name, r.value]),
    [
      ['Joined', 15],
      ['Left', 10],
    ]
  );
  assert.equal(tip.total, undefined, 'no total for plain lines');
  assert.deepEqual(
    tooltipOf(graph, 0, new Set(['y1'])).rows.map((r) => r.id),
    ['y0']
  );
  const stacked = parseGraph(chart({ stacked: true }));
  assert.equal(tooltipOf(stacked, 1).total, 25);
  const pct = parseGraph(chart({ percentage: true }));
  assert.equal(tooltipOf(pct, 0).rows[0].percent, (10 / 15) * 100);
  assert.deepEqual(xTickIndexes(3), [0, 1, 2]);
  assert.deepEqual(xTickIndexes(9), [0, 2, 4, 6, 8]);
  const nice = niceTicks(0, 87);
  assert.ok(nice.max >= 87 && nice.ticks[0] === 0);
  assert.equal(isHourly(graph), false);
  assert.equal(
    isHourly(
      parseGraph({
        columns: [
          ['x', 0, 3600000],
          ['y', 1, 2],
        ],
        types: {},
      })
    ),
    true
  );
});

test('numbers, percentages and changes', () => {
  assert.equal(formatCompact(999), '999');
  assert.equal(formatCompact(1234), '1.2K');
  assert.equal(formatCompact(1000), '1K');
  assert.equal(formatCompact(3_400_000), '3.4M');
  assert.equal(formatCompact(-2500), '-2.5K');
  assert.equal(formatCompact('x'), '0');
  assert.equal(formatNumber(1234567, 'en'), '1,234,567');
  assert.equal(formatNumber(12.34, 'en'), '12.3');
  assert.equal(formatPercent(12.345), '12.3%');
  assert.equal(formatPercent(50), '50%');
  assert.equal(percentOf(1, 4), 25);
  assert.equal(percentOf(1, 0), 0);
  assert.deepEqual(changeOf(120, 100), {
    delta: 20,
    percent: 20,
    direction: 'up',
  });
  assert.equal(changeOf(5, 0).percent, null);
  assert.equal(changeOf(80, 100).direction, 'down');
  assert.equal(formatChange(1500, 1000), '+500 (50%)');
  assert.equal(formatChange(900, 1000), '-100 (10%)');
  assert.equal(formatChange(5, 0), '+5');
  assert.equal(formatChange(7, 7), '0');
});

// --- the source with a fake client -----------------------------------

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };
const Api = {
  channels: {
    GetFullChannel: named('GetFullChannel'),
    GetMessages: named('GetMessages'),
  },
  stats: {
    GetBroadcastStats: named('GetBroadcastStats'),
    GetMegagroupStats: named('GetMegagroupStats'),
    LoadAsyncGraph: named('LoadAsyncGraph'),
  },
  InputMessageID: named('InputMessageID'),
};
const graph = (className, fields) => ({ className, ...fields });
const json = (text, zoomToken) =>
  graph('StatsGraph', { json: { data: text }, zoomToken });
const pair = (current, previous) => ({ current, previous });

const make = (answers, { dc = 0, canView = true, broadcast = true } = {}) => {
  const log = [];
  const client = {
    session: { dcId: 2 },
    invoke: async (request, onDc) => {
      log.push({ name: request.className, request, dc: onDc });
      if (request.className === 'GetFullChannel') {
        return {
          fullChat: { canViewStats: canView, statsDc: dc },
          chats: [{ id: 5n, broadcast }],
        };
      }
      const answer = answers[request.className];
      const next =
        typeof answer === 'function' ? answer(request, onDc) : answer;
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const stats = createStats(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client }
  );
  return { ...stats, log };
};

const broadcastStats = () => ({
  period: { minDate: 100, maxDate: 200 },
  followers: pair(1000, 900),
  viewsPerPost: pair(50.5, 60),
  sharesPerPost: pair(3, 3),
  reactionsPerPost: pair(7, 5),
  enabledNotifications: { part: 25, total: 100 },
  growthGraph: json('{"a":1}', 'zoom-1'),
  followersGraph: graph('StatsGraphAsync', { token: 'tok-1' }),
  muteGraph: graph('StatsGraphError', { error: 'No data' }),
  recentPostsInteractions: [
    graph('PostInteractionCountersMessage', {
      msgId: 7,
      views: 100,
      forwards: 2,
      reactions: 5,
    }),
    graph('PostInteractionCountersMessage', {
      msgId: 9,
      views: 300,
      forwards: 4,
      reactions: 1,
    }),
    graph('PostInteractionCountersStory', { storyId: 1, views: 1 }),
  ],
});

test('a channel: overview, graphs by kind, posts with their text', async () => {
  const { chatStats, log } = make({
    GetBroadcastStats: broadcastStats(),
    GetMessages: {
      messages: [
        { id: 9, message: 'Newest   post', date: 1700000000 },
        { id: 7, message: '', media: { className: 'MessageMediaPhoto' } },
      ],
    },
  });
  const answer = await chatStats({ chat: '-1005' });
  assert.equal(answer.ok, true);
  assert.equal(answer.kind, 'broadcast');
  assert.deepEqual(answer.period, { from: 100, to: 200 });
  assert.deepEqual(answer.overview[0], {
    key: 'followers',
    current: 1000,
    previous: 900,
  });
  assert.deepEqual(answer.notifications, { part: 25, total: 100 });
  assert.deepEqual(
    answer.graphs.map((g) => [g.key, Object.keys(g.graph)[0]]),
    [
      ['growth', 'json'],
      ['followers', 'token'],
      ['mute', 'error'],
    ]
  );
  assert.equal(answer.graphs[0].graph.zoom, 'zoom-1');
  assert.deepEqual(
    answer.posts.map((p) => [p.id, p.views, p.text, p.media]),
    [
      [9, 300, 'Newest post', false],
      [7, 100, '', true],
    ]
  );
  const fetched = log.find((l) => l.name === 'GetMessages');
  assert.deepEqual(
    fetched.request.id.map((m) => m.id),
    [9, 7]
  );
});

test('a supergroup: overview, top posters with names', async () => {
  const { chatStats } = make(
    {
      GetMegagroupStats: {
        period: { minDate: 1, maxDate: 2 },
        members: pair(500, 400),
        messages: pair(80, 90),
        viewers: pair(30, 30),
        posters: pair(10, 12),
        membersGraph: json('{}'),
        topPosters: [{ userId: 11n, messages: 40, avgChars: 55 }],
        topAdmins: [{ userId: 12n, deleted: 1, kicked: 2, banned: 3 }],
        topInviters: [{ userId: 13n, invitations: 6 }],
        users: [
          { id: 11n, firstName: 'Ann', lastName: 'Lee' },
          { id: 12n, username: 'boss' },
        ],
      },
    },
    { broadcast: false }
  );
  const answer = await chatStats({ chat: '-1005' });
  assert.equal(answer.kind, 'megagroup');
  assert.deepEqual(
    answer.overview.map((o) => o.key),
    ['members', 'messages', 'viewers', 'posters']
  );
  assert.deepEqual(answer.posters, [
    { id: '11', name: 'Ann Lee', messages: 40, avgChars: 55 },
  ]);
  assert.equal(answer.admins[0].name, 'boss');
  assert.equal(answer.admins[0].banned, 3);
  assert.deepEqual(answer.inviters, [{ id: '13', name: '13', invitations: 6 }]);
  assert.equal(answer.posts, undefined);
});

test('the stats DC: used when it is not ours, migrated on STATS_MIGRATE_X', async () => {
  const same = make(
    { GetBroadcastStats: broadcastStats(), GetMessages: {} },
    { dc: 2 }
  );
  await same.chatStats({ chat: '-1005' });
  assert.equal(
    same.log.find((l) => l.name === 'GetBroadcastStats').dc,
    undefined,
    'our own DC is asked directly'
  );

  const far = make(
    { GetBroadcastStats: broadcastStats(), GetMessages: {} },
    { dc: 4 }
  );
  await far.chatStats({ chat: '-1005' });
  assert.equal(far.log.find((l) => l.name === 'GetBroadcastStats').dc, 4);

  // The graph request follows the same DC.
  const loaded = make({ LoadAsyncGraph: json('{"b":2}') }, { dc: 4 });
  const first = await loaded.statsGraph({
    chat: '-1005',
    token: 't',
    x: '86400000',
  });
  assert.deepEqual(first, { ok: true, graph: { json: '{"b":2}' } });
  const ask = loaded.log.find((l) => l.name === 'LoadAsyncGraph');
  assert.equal(ask.dc, 4);
  assert.equal(ask.request.token, 't');
  assert.equal(ask.request.x, 86400000n);

  let tries = 0;
  const moved = make({
    GetBroadcastStats: (_r, onDc) => {
      tries += 1;
      return onDc === 5
        ? broadcastStats()
        : Object.assign(new Error('x'), { errorMessage: 'STATS_MIGRATE_5' });
    },
    GetMessages: {},
  });
  const answer = await moved.chatStats({ chat: '-1005' });
  assert.equal(answer.ok, true);
  assert.equal(tries, 2);
  // Learned: the next graph goes straight to DC 5.
  await moved.statsGraph({ chat: '-1005', token: 't' }).catch(() => null);
  const after = moved.log.filter((l) => l.name === 'LoadAsyncGraph');
  assert.equal(after[0].dc, 5);
});

test('no access, bad requests and Telegram errors become codes', async () => {
  const denied = make({}, { canView: false });
  const refused = await denied.chatStats({ chat: '-1005' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'no-access');
  assert.equal(
    denied.log.some((l) => l.name === 'GetBroadcastStats'),
    false
  );

  const { chatStats, statsGraph, log } = make({
    GetBroadcastStats: Object.assign(new Error('x'), {
      errorMessage: 'CHAT_ADMIN_REQUIRED',
    }),
    LoadAsyncGraph: Object.assign(new Error('x'), {
      errorMessage: 'GRAPH_EXPIRED_RELOAD',
    }),
  });
  for (const body of [{}, { chat: '-5' }, { chat: '42' }, { chat: 'x' }]) {
    assert.equal((await chatStats(body)).ok, false);
  }
  const bad = [
    { chat: '-1005' },
    { chat: '-1005', token: '' },
    { chat: '-1005', token: 5 },
    { chat: '-1005', token: 'a'.repeat(MAX_TOKEN + 1) },
    { chat: '-1005', token: 'a', x: 'z' },
    { chat: '-5', token: 'a' },
  ];
  for (const body of bad) {
    assert.equal((await statsGraph(body)).ok, false);
  }
  assert.equal(log.length, 0);
  assert.equal((await chatStats({ chat: '-1005' })).code, 'no-access');
  assert.equal((await statsGraph({ chat: '-1005', token: 'a' })).ok, false);
  assert.deepEqual(graphOf(undefined), null);
});

// --- routes ----------------------------------------------------------

const post = async (name, body, account) => {
  const path = `/api/telegram/${name}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res.status;
};

test('the routes validate strictly', async () => {
  const seen = [];
  const account = {
    chatStats: async (a) => (seen.push(a), { ok: true }),
    statsGraph: async (a) => (seen.push(a), { ok: true }),
  };
  for (const bad of [{}, { chat: 'me' }, { chat: '-5' }, { chat: '42' }]) {
    assert.equal(await post('chat-stats', bad, account), 400);
  }
  assert.equal(await post('chat-stats', { chat: '-1005' }, account), 200);
  for (const bad of [
    { chat: '-1005' },
    { chat: '-1005', token: '' },
    { chat: '-1005', token: 7 },
    { chat: '-1005', token: 'a'.repeat(MAX_TOKEN + 1) },
    { chat: '-1005', token: 'a', x: 'q' },
    { chat: '-5', token: 'a' },
  ]) {
    assert.equal(await post('stats-graph', bad, account), 400);
  }
  assert.equal(
    await post(
      'stats-graph',
      { chat: '-1005', token: 'a'.repeat(MAX_TOKEN), x: 5 },
      account
    ),
    200
  );
  assert.equal(seen.at(-1).x, '5');
  assert.equal(await post('chat-stats', { chat: '-1005' }, {}), 400);
});

test('page helper: the row only for those who may view statistics', () => {
  const api = { telegramChatStats: () => {} };
  const channel = { source: 'telegram', chat: '-1005' };
  assert.equal(hasStats(channel, { canViewStats: true }, api), true);
  assert.equal(hasStats(channel, { canViewStats: false }, api), false);
  assert.equal(hasStats(channel, {}, api), false);
  assert.equal(
    hasStats({ ...channel, chat: '-7' }, { canViewStats: true }, api),
    false
  );
  assert.equal(
    hasStats({ ...channel, chat: '42' }, { canViewStats: true }, api),
    false
  );
  assert.equal(hasStats(channel, { canViewStats: true }, {}), false);
});
