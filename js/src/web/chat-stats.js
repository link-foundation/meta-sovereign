// "Statistics" of a channel or a big supergroup, as Telegram Desktop shows
// it to admins (R-Y167; learned, never copied). The info column offers the
// row when Telegram says the user can view statistics; it opens a wide
// dialog with the overview (each figure beside its change from the
// previous period), the graphs, and the recent posts (channel) or the top
// posters, admins and inviters (supergroup). A graph Telegram sends as a
// token loads when it scrolls into view; one with a zoom token zooms into a
// day on a click. Graphs are drawn here as SVG (stats-graph.js has the
// maths): hover or tap for a tooltip with the date and values, the legend
// toggles a series. Nothing leaves the page but the stats requests.
// R-Y195 adds the Stars revenue section (and a bot's own entry for it).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import {
  changeOf,
  formatChange,
  formatCompact,
  formatNumber,
  formatPercent,
  formatX,
  isHourly,
  layoutGraph,
  nearestIndex,
  parseGraph,
  percentOf,
  shareRows,
  tooltipOf,
} from './stats-graph.js';

const el = React.createElement;

/** Whether the info column offers Statistics: an admin who may view them. */
export const hasStats = (chat, info, api) =>
  chat?.source === 'telegram' &&
  /^-100\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canViewStats) &&
  typeof api?.telegramChatStats === 'function';

/** Whether the info column offers a bot's "Stars revenue" (R-Y195). */
export const hasBotRevenue = (chat, info, api) =>
  chat?.source === 'telegram' &&
  /^\d{1,15}$/.test(String(chat.chat)) &&
  Boolean(info?.bot && info?.canViewStarsRevenue) &&
  typeof api?.telegramStarsRevenue === 'function';

/** Stars as a number: whole, or two decimals when there is a fraction. */
export const formatStars = (value, locale) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Number(value) || 0
  );

/** The USD a number of Stars is worth at Telegram's rate: "$1.30". */
export const formatUsd = (stars, rate, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
    (Number(stars) || 0) * (Number(rate) || 0)
  );

const errorText = (t, code) => {
  const key = `chat.stats.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.stats.err.failed') : text;
};

// A graph is on screen (or near it): true once, then for good. Without
// IntersectionObserver it is simply true.
const useSeen = (ref) => {
  const [seen, setSeen] = useState(
    typeof globalThis.IntersectionObserver === 'undefined'
  );
  useEffect(() => {
    if (seen || !ref.current) {
      return undefined;
    }
    const watcher = new globalThis.IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          watcher.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    watcher.observe(ref.current);
    return () => watcher.disconnect();
  }, [seen, ref]);
  return seen;
};

// The graph a card shows: loaded from its token when seen, zoomed on a day.
const useGraphSource = (api, chat, raw, seen) => {
  const [loaded, setLoaded] = useState(null); // { graph } | { error }
  const [zoomed, setZoomed] = useState(null);
  useEffect(() => {
    if (!raw.token || !seen) {
      return undefined;
    }
    let live = true;
    api
      .telegramStatsGraph({ chat, token: raw.token })
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setLoaded(answer?.ok ? { graph: answer.graph } : { error: answer });
        }
      });
    return () => {
      live = false;
    };
  }, [api, chat, raw, seen]);
  const zoomTo = (graph, i) =>
    api
      .telegramStatsGraph({ chat, token: graph.zoom, x: String(graph.xs[i]) })
      .catch(() => null)
      .then((answer) => {
        if (answer?.ok && answer.graph?.json) {
          setZoomed({ raw: answer.graph });
        }
      });
  const base = raw.token ? loaded?.graph : raw;
  return {
    shown: zoomed?.raw ?? base ?? null,
    failed: raw.token ? loaded?.error : null,
    base,
    zoomed: Boolean(zoomed),
    zoomTo,
    unzoom: () => setZoomed(null),
  };
};

const Legend = ({ graph, hidden, toggle }) =>
  graph.series.length > 1
    ? el(
        'div',
        { className: 'stats-legend' },
        graph.series.map((s) =>
          el(
            'button',
            {
              key: s.id,
              type: 'button',
              className: 'stats-legend-item',
              'data-legend': s.id,
              'aria-pressed': !hidden.has(s.id),
              style: { '--series': s.color },
              onClick: () => toggle(s.id),
            },
            s.name
          )
        )
      )
    : null;

const Tooltip = ({ graph, layout, index, hidden, locale, t, zoomable }) => {
  const tip = tooltipOf(graph, index, hidden);
  const ratio = layout.xAt(index) / layout.plot.width;
  const style = { left: `${ratio * 100}%` };
  return el(
    'div',
    {
      className: `stats-tooltip${ratio > 0.6 ? ' is-right' : ''}`,
      style,
      'data-stats-tooltip': index,
    },
    [
      el(
        'strong',
        { key: 'd' },
        formatX(tip.ms, locale, isHourly(graph) ? 'hour' : 'full')
      ),
      ...tip.rows.map((row) =>
        el('div', { key: row.id, className: 'stats-tooltip-row' }, [
          el('i', { key: 'c', style: { background: row.color } }),
          el('span', { key: 'n' }, row.name),
          el(
            'b',
            { key: 'v' },
            row.percent === undefined
              ? formatNumber(row.value, locale)
              : `${formatNumber(row.value, locale)} (${formatPercent(row.percent)})`
          ),
        ])
      ),
      tip.total === undefined
        ? null
        : el('div', { key: 'tot', className: 'stats-tooltip-row' }, [
            el('span', { key: 'n' }, t('chat.stats.total')),
            el('b', { key: 'v' }, formatNumber(tip.total, locale)),
          ]),
      zoomable
        ? el('small', { key: 'z', className: 'meta' }, t('chat.stats.zoomHint'))
        : null,
    ]
  );
};

const Shape = ({ shape }) => {
  if (shape.kind === 'bar') {
    return el(
      'g',
      { fill: shape.color, 'data-shape': shape.id },
      shape.rects.map((r, i) =>
        el('rect', { key: i, x: r.x, y: r.y, width: r.w, height: r.h })
      )
    );
  }
  return el('path', {
    d: shape.d,
    'data-shape': shape.id,
    fill: shape.kind === 'area' ? shape.color : 'none',
    'fill-opacity': shape.kind === 'area' ? 0.75 : undefined,
    stroke: shape.kind === 'area' ? 'none' : shape.color,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  });
};

const Axes = ({ layout, graph, locale }) => {
  const { plot } = layout;
  const style = isHourly(graph) ? 'hour' : 'day';
  return el('g', { className: 'stats-axes' }, [
    ...layout.yTicks.map((tick) =>
      el('g', { key: `y${tick.v}` }, [
        el('line', {
          x1: plot.left,
          x2: plot.left + plot.w,
          y1: tick.y,
          y2: tick.y,
        }),
        el('text', { x: plot.left - 6, y: tick.y + 4, textAnchor: 'end' }, [
          formatCompact(tick.v),
        ]),
      ])
    ),
    ...layout.xTicks.map((tick) =>
      el(
        'text',
        {
          key: `x${tick.i}`,
          x: tick.x,
          y: plot.height - 6,
          textAnchor: 'middle',
        },
        [formatX(tick.ms, locale, style)]
      )
    ),
  ]);
};

const Chart = ({ graph, hidden, toggle, onZoom, locale, t }) => {
  const [index, setIndex] = useState(null);
  const layout = useMemo(() => layoutGraph(graph, hidden), [graph, hidden]);
  const point = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const view =
      ((e.clientX - box.left) / (box.width || 1)) * layout.plot.width;
    setIndex(nearestIndex(graph, (view - layout.plot.left) / layout.plot.w));
  };
  return el('div', { className: 'stats-chart' }, [
    el('div', { key: 'box', className: 'stats-chart-box' }, [
      el(
        'svg',
        {
          key: 's',
          viewBox: `0 0 ${layout.plot.width} ${layout.plot.height}`,
          role: 'img',
          'data-stats-svg': graph.kind,
          onPointerMove: point,
          onPointerDown: point,
          onPointerLeave: (e) => e.pointerType === 'mouse' && setIndex(null),
          onClick: () => graph.zoom && index !== null && onZoom(index),
        },
        [
          el(Axes, { key: 'a', layout, graph, locale }),
          ...layout.shapes.map((shape) => el(Shape, { key: shape.id, shape })),
          index === null
            ? null
            : el('line', {
                key: 'cur',
                className: 'stats-cursor',
                x1: layout.xAt(index),
                x2: layout.xAt(index),
                y1: layout.plot.top,
                y2: layout.plot.top + layout.plot.h,
              }),
        ]
      ),
      index === null
        ? null
        : el(Tooltip, {
            key: 'tip',
            graph,
            layout,
            index,
            hidden,
            locale,
            t,
            zoomable: Boolean(graph.zoom),
          }),
    ]),
    el(Legend, { key: 'l', graph, hidden, toggle }),
  ]);
};

const Shares = ({ graph, hidden, toggle, locale }) =>
  el('div', { className: 'stats-shares' }, [
    ...shareRows(graph, hidden).map((row) =>
      el(
        'div',
        { key: row.id, className: 'stats-share', 'data-share': row.id },
        [
          el('span', { key: 'n', className: 'stats-share-name' }, row.name),
          el('span', { key: 'b', className: 'stats-share-bar' }, [
            el('i', {
              key: 'i',
              style: { width: `${row.percent}%`, background: row.color },
            }),
          ]),
          el('b', { key: 'p' }, formatPercent(row.percent)),
          el(
            'small',
            { key: 'v', className: 'meta' },
            formatNumber(row.value, locale)
          ),
        ]
      )
    ),
    el(Legend, { key: 'l', graph, hidden, toggle }),
  ]);

const useHidden = () => {
  const [hidden, setHidden] = useState(() => new Set());
  const toggle = (graph) => (id) =>
    setHidden((was) => {
      const next = new Set(was);
      if (next.has(id)) {
        next.delete(id);
      } else if (graph.series.length - next.size > 1) {
        next.add(id);
      }
      return next;
    });
  return [hidden, toggle, () => setHidden(new Set())];
};

// What a card holds: the chart, a note while loading, or the failure.
const CardBody = ({ source, graph, hidden, toggle, locale, t }) => {
  if (source.shown?.error || source.failed) {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert', 'data-stats-error': true },
      source.shown?.error || errorText(t, source.failed?.code ?? 'failed')
    );
  }
  if (!source.shown) {
    return el('p', { className: 'meta' }, t('chat.stats.loading'));
  }
  if (!graph) {
    return el('p', { className: 'meta' }, t('chat.stats.noData'));
  }
  const props = { graph, hidden, toggle: toggle(graph), locale, t };
  return graph.kind === 'share'
    ? el(Shares, props)
    : el(Chart, { ...props, onZoom: (i) => source.zoomTo(graph, i) });
};

export const GraphCard = ({ api, chat, entry }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const ref = useRef(null);
  const seen = useSeen(ref);
  const source = useGraphSource(api, chat, entry.graph, seen);
  const [hidden, toggle, reset] = useHidden();
  const graph = useMemo(
    () => (source.shown?.json ? parseGraph(source.shown.json) : null),
    [source.shown]
  );
  // A graph with a zoom token keeps its zoom token on the parsed graph.
  const withZoom =
    graph && source.shown?.zoom ? { ...graph, zoom: source.shown.zoom } : graph;
  useEffect(reset, [source.shown]);
  return el(
    'section',
    { ref, className: 'stats-graph', 'data-graph': entry.key },
    [
      el('header', { key: 'h', className: 'stats-graph-head' }, [
        el('strong', { key: 't' }, t(`chat.stats.g.${entry.key}`)),
        source.zoomed
          ? el(
              'button',
              {
                key: 'z',
                type: 'button',
                className: 'button',
                'data-action': 'stats-unzoom',
                onClick: source.unzoom,
              },
              t('chat.stats.unzoom')
            )
          : null,
      ]),
      el(CardBody, {
        key: 'b',
        source,
        graph: withZoom,
        hidden,
        toggle,
        locale,
        t,
      }),
    ]
  );
};

const Figure = ({ item, locale, t }) => {
  const change = changeOf(item.current, item.previous);
  return el('div', { className: 'stats-figure', 'data-figure': item.key }, [
    el('span', { key: 'l', className: 'meta' }, t(`chat.stats.ov.${item.key}`)),
    el('strong', { key: 'v' }, formatNumber(item.current, locale)),
    el(
      'span',
      { key: 'c', className: 'stats-change', 'data-change': change.direction },
      formatChange(item.current, item.previous)
    ),
  ]);
};

const Overview = ({ data, locale, t }) =>
  el('div', { className: 'stats-overview' }, [
    ...data.overview.map((item) =>
      el(Figure, { key: item.key, item, locale, t })
    ),
    data.notifications && data.notifications.total > 0
      ? el(
          'div',
          {
            key: 'n',
            className: 'stats-figure',
            'data-figure': 'notifications',
          },
          [
            el(
              'span',
              { key: 'l', className: 'meta' },
              t('chat.stats.ov.notifications')
            ),
            el(
              'strong',
              { key: 'v' },
              formatPercent(
                percentOf(data.notifications.part, data.notifications.total)
              )
            ),
          ]
        )
      : null,
  ]);

const Posts = ({ posts, locale, t }) =>
  posts?.length
    ? el('section', { className: 'stats-list', 'data-stats-posts': true }, [
        el('strong', { key: 'h' }, t('chat.stats.posts')),
        ...posts.map((post) =>
          el('div', { key: post.id, className: 'stats-post' }, [
            el(
              'span',
              { key: 't', className: 'stats-post-text' },
              post.text || (post.media ? t('chat.stats.media') : `#${post.id}`)
            ),
            el(
              'span',
              { key: 'n', className: 'meta' },
              t('chat.stats.postLine', {
                views: formatCompact(post.views),
                shares: formatCompact(post.forwards),
                reactions: formatCompact(post.reactions),
              })
            ),
            post.date
              ? el(
                  'small',
                  { key: 'd', className: 'meta' },
                  formatX(post.date * 1000, locale, 'full')
                )
              : null,
          ])
        ),
      ])
    : null;

const TopList = ({ name, rows, line, t }) =>
  rows?.length
    ? el('section', { className: 'stats-list', 'data-stats-top': name }, [
        el('strong', { key: 'h' }, t(`chat.stats.top.${name}`)),
        ...rows.map((row) =>
          el('div', { key: row.id, className: 'stats-person' }, [
            el('span', { key: 'n' }, row.name),
            el('span', { key: 'l', className: 'meta' }, line(row)),
          ])
        ),
      ])
    : null;

const Tops = ({ data, locale, t }) => {
  const n = (v) => formatNumber(v, locale);
  return [
    el(TopList, {
      key: 'p',
      name: 'posters',
      rows: data.posters,
      t,
      line: (r) =>
        t('chat.stats.posterLine', {
          messages: n(r.messages),
          chars: n(r.avgChars),
        }),
    }),
    el(TopList, {
      key: 'a',
      name: 'admins',
      rows: data.admins,
      t,
      line: (r) =>
        t('chat.stats.adminLine', {
          deleted: n(r.deleted),
          kicked: n(r.kicked),
          banned: n(r.banned),
        }),
    }),
    el(TopList, {
      key: 'i',
      name: 'inviters',
      rows: data.inviters,
      t,
      line: (r) => t('chat.stats.inviterLine', { count: n(r.invitations) }),
    }),
  ];
};

const BALANCES = ['current', 'available', 'overall'];

// The Stars revenue (payments.getStarsRevenueStats): the three balances
// with their USD worth, the rate and the revenue graph (R-Y195). Taking
// the Stars out is Telegram's (Fragment's) own page, not offered here.
const StarsRevenue = ({ api, chat }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const [state, setState] = useState({ busy: true, data: null, code: null });
  useEffect(() => {
    let live = true;
    api
      .telegramStarsRevenue({ chat })
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { busy: false, data: answer, code: null }
              : { busy: false, data: null, code: answer?.code ?? 'failed' }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, chat]);
  const { busy, data, code } = state;
  return el('section', { className: 'stats-stars', 'data-stats-stars': true }, [
    el('strong', { key: 'h' }, t('chat.stars.title')),
    busy
      ? el('p', { key: 'l', className: 'meta' }, t('chat.stats.loading'))
      : null,
    code
      ? el(
          'p',
          { key: 'e', className: 'comments-failed', role: 'alert' },
          errorText(t, code)
        )
      : null,
    data
      ? el('div', { key: 'd' }, [
          el(
            'div',
            { key: 'f', className: 'stats-overview' },
            BALANCES.map((name) =>
              el(
                'div',
                {
                  key: name,
                  className: 'stats-figure',
                  'data-stars-balance': name,
                },
                [
                  el(
                    'span',
                    { key: 'l', className: 'meta' },
                    t(`chat.stars.${name}`)
                  ),
                  el(
                    'strong',
                    { key: 'v' },
                    `⭐ ${formatStars(data.status[name], locale)}`
                  ),
                  el(
                    'span',
                    { key: 'u', className: 'stats-change' },
                    `≈ ${formatUsd(data.status[name], data.usdRate, locale)}`
                  ),
                ]
              )
            )
          ),
          data.usdRate > 0
            ? el(
                'p',
                { key: 'r', className: 'meta', 'data-stars-rate': true },
                t('chat.stars.rate', {
                  rate: formatUsd(1, data.usdRate, locale),
                })
              )
            : null,
          data.graph
            ? el(GraphCard, {
                key: 'g',
                api,
                chat,
                entry: { key: 'revenue', graph: data.graph },
              })
            : null,
        ])
      : null,
  ]);
};

const useStats = (api, chat) => {
  const [state, setState] = useState({ busy: true, data: null, code: null });
  useEffect(() => {
    let live = true;
    setState({ busy: true, data: null, code: null });
    api
      .telegramChatStats({ chat })
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { busy: false, data: answer, code: null }
              : { busy: false, data: null, code: answer?.code ?? 'failed' }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, chat]);
  return state;
};

const StatsDialog = ({ api, chat, info, onClose }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const { busy, data, code } = useStats(api, chat);
  const period =
    data?.period?.from && data.period.to
      ? `${formatX(data.period.from * 1000, locale, 'full')} – ${formatX(data.period.to * 1000, locale, 'full')}`
      : null;
  return el(
    Frame,
    { title: t('chat.stats.title'), close: onClose, name: 'stats' },
    [
      busy
        ? el('p', { key: 'l', className: 'meta' }, t('chat.stats.loading'))
        : null,
      code
        ? el(
            'p',
            {
              key: 'e',
              className: 'comments-failed',
              role: 'alert',
              'data-stats-error': code,
            },
            errorText(t, code)
          )
        : null,
      data
        ? el(
            'div',
            { key: 'd', className: 'stats-body', 'data-stats-kind': data.kind },
            [
              period ? el('p', { key: 'p', className: 'meta' }, period) : null,
              el(Overview, { key: 'o', data, locale, t }),
              ...data.graphs.map((entry) =>
                el(GraphCard, { key: entry.key, api, chat, entry })
              ),
              el(Posts, { key: 'po', posts: data.posts, locale, t }),
              ...Tops({ data, locale, t }),
              info?.canViewStarsRevenue &&
              typeof api.telegramStarsRevenue === 'function'
                ? el(StarsRevenue, { key: 'stars', api, chat })
                : null,
            ]
          )
        : null,
    ]
  );
};

// A bot's own dialog: just its Stars revenue.
const BotRevenueDialog = ({ api, chat, onClose }) => {
  const t = useT();
  return el(
    Frame,
    { title: t('chat.stars.title'), close: onClose, name: 'stars-revenue' },
    el('div', { className: 'stats-body', 'data-stats-kind': 'bot' }, [
      el(StarsRevenue, { key: 's', api, chat }),
    ])
  );
};

/**
 * The info column's row; it opens the Statistics dialog (a channel or
 * supergroup), or a bot's Stars revenue (R-Y195).
 */
export const StatsRow = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const bot = hasBotRevenue(chat, info, api);
  if (!bot && !hasStats(chat, info, api)) {
    return null;
  }
  const Dialog = bot ? BotRevenueDialog : StatsDialog;
  return el('section', { className: 'person-section peer-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'peer-action',
        'data-action': bot ? 'stars-revenue-open' : 'stats-open',
        onClick: () => setOpen(true),
      },
      t(bot ? 'chat.stars.row' : 'chat.stats.row')
    ),
    open
      ? el(Dialog, {
          key: 'd',
          api,
          chat: String(chat.chat),
          info,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};
