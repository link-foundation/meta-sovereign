// Pure helpers behind the statistics graphs (R-Y167; learned, never
// copied): Telegram's chart JSON ({ columns, types, names, colors,
// stacked, percentage, y_scaled }) turned into series, the scale and the
// shapes an SVG draws (lines, areas, bars, stacked bars), the tooltip's
// rows, and the number, change and percentage formatting of the overview.
// No DOM, no network: the page's chart component only draws what these give.

const MAX_POINTS = 2000;
const MAX_SERIES = 40;
const DAY_MS = 86_400_000;
const PRECISION = 100;

const round = (n) => Math.round(n * PRECISION) / PRECISION;
const isNumbers = (list) =>
  list.every((v) => typeof v === 'number' && Number.isFinite(v));

// A parsed column: its id and its numbers, or null if it is not one.
const columnOf = (column) =>
  Array.isArray(column) && typeof column[0] === 'string'
    ? { id: column[0], values: column.slice(1) }
    : null;

const seriesOf = (data, columns, xs) =>
  columns
    .filter(
      (c) =>
        c.id !== 'x' &&
        data.types?.[c.id] !== 'x' &&
        c.values.length === xs.length &&
        isNumbers(c.values)
    )
    .slice(0, MAX_SERIES)
    .map((c, i) => ({
      id: c.id,
      name: String(data.names?.[c.id] ?? c.id),
      color: /^#[0-9a-fA-F]{3,8}$/.test(data.colors?.[c.id] ?? '')
        ? data.colors[c.id]
        : DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      type: String(data.types?.[c.id] ?? 'line'),
      values: c.values,
    }));

const DEFAULT_COLORS = [
  '#3497ed',
  '#2373db',
  '#9ed448',
  '#5fb641',
  '#f5bd25',
  '#f79e39',
  '#e65850',
];

/**
 * Telegram's chart JSON (text or already parsed) as `{ xs, series,
 * stacked, percentage, yScaled, kind }`, or null if it is not a chart
 * (no x column, ragged or non-numeric columns, nothing to draw). `kind`:
 * 'line', 'area', 'bar', or 'share' (a single moment: drawn as ranked
 * shares, as Telegram draws its pie charts).
 */
export const parseGraph = (input) => {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.columns)) {
    return null;
  }
  const columns = data.columns.map(columnOf).filter(Boolean);
  const x = columns.find((c) => c.id === 'x' || data.types?.[c.id] === 'x');
  if (!x || x.values.length === 0 || x.values.length > MAX_POINTS) {
    return null;
  }
  if (!isNumbers(x.values)) {
    return null;
  }
  const series = seriesOf(data, columns, x.values);
  if (series.length === 0) {
    return null;
  }
  const percentage = Boolean(data.percentage);
  const stacked = Boolean(data.stacked) || percentage;
  return {
    xs: x.values,
    series,
    stacked,
    percentage,
    yScaled: Boolean(data.y_scaled),
    kind: kindOf(data, series, x.values.length),
  };
};

const kindOf = (data, series, points) => {
  if (data.pie || (points === 1 && series.length > 1)) {
    return 'share';
  }
  const first = series[0].type;
  if (first === 'bar') {
    return 'bar';
  }
  return first === 'area' ? 'area' : 'line';
};

const shown = (graph, hidden) => graph.series.filter((s) => !hidden?.has(s.id));

/** A nice upper bound and ticks for values from `min` to `max`. */
export const niceTicks = (min, max, count = 4) => {
  const low = Math.min(0, min);
  const span = Math.max(max - low, 1e-9);
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ??
    10 * power;
  const first = Math.floor(low / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = first; v <= last + step / 2; v += step) {
    ticks.push(round(v));
  }
  return { min: first, max: last === first ? first + step : last, ticks };
};

// Each column's values as drawn: percentages of the column for a
// percentage chart, else as they are.
const drawn = (graph, list) =>
  graph.percentage
    ? list.map((s) => ({
        ...s,
        values: s.values.map((v, i) => {
          const sum = list.reduce((a, o) => a + o.values[i], 0);
          return sum > 0 ? (v / sum) * 100 : 0;
        }),
      }))
    : list;

const extent = (graph, list) => {
  if (graph.stacked) {
    const sums = graph.xs.map((_, i) =>
      list.reduce((a, s) => a + Math.max(0, s.values[i]), 0)
    );
    return { min: 0, max: graph.percentage ? 100 : Math.max(0, ...sums) };
  }
  const all = list.flatMap((s) => s.values);
  return { min: Math.min(0, ...all), max: Math.max(0, ...all) };
};

/** Where column `i` sits across the plot, 0..1. */
export const xRatio = (graph, i) => {
  const n = graph.xs.length;
  if (graph.kind === 'bar') {
    return (i + 0.5) / n;
  }
  return n === 1 ? 0.5 : i / (n - 1);
};

/** The column nearest to a position across the plot (0..1). */
export const nearestIndex = (graph, ratio) => {
  const n = graph.xs.length;
  const r = Math.min(1, Math.max(0, Number(ratio) || 0));
  const i = graph.kind === 'bar' ? Math.floor(r * n) : Math.round(r * (n - 1));
  return Math.min(n - 1, Math.max(0, i));
};

const SIZE = {
  width: 600,
  height: 220,
  left: 44,
  right: 10,
  top: 10,
  bottom: 24,
};

const makeScale = (plot, lo, hi) => (v) =>
  round(plot.top + plot.h - ((v - lo) / (hi - lo || 1)) * plot.h);

const lineD = (points) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join('');

const areaD = (tops, bottoms) =>
  `${lineD(tops)}${lineD([...bottoms].reverse()).replace(/^M/, 'L')}Z`;

// Cumulative baselines of a stack: for each series, the values beneath it.
const stackBases = (list, n) => {
  const under = Array(n).fill(0);
  return list.map((s) => {
    const base = [...under];
    s.values.forEach((v, i) => {
      under[i] += Math.max(0, v);
    });
    return { s, base };
  });
};

const lineShape = (s, xAt, yAt, scale) => ({
  id: s.id,
  color: s.color,
  kind: 'line',
  d: lineD(s.values.map((v, i) => [xAt(i), (scale ?? yAt)(v)])),
});

const areaShapes = (graph, list, xAt, yAt) => {
  if (!graph.stacked) {
    return list.map((s) => ({
      id: s.id,
      color: s.color,
      kind: 'area',
      d: areaD(
        s.values.map((v, i) => [xAt(i), yAt(v)]),
        s.values.map((_, i) => [xAt(i), yAt(0)])
      ),
    }));
  }
  return stackBases(list, graph.xs.length).map(({ s, base }) => ({
    id: s.id,
    color: s.color,
    kind: 'area',
    d: areaD(
      s.values.map((v, i) => [xAt(i), yAt(base[i] + Math.max(0, v))]),
      s.values.map((_, i) => [xAt(i), yAt(base[i])])
    ),
  }));
};

const barShapes = (graph, list, plot, xAt, yAt) => {
  const slot = plot.w / graph.xs.length;
  const wide = Math.max(1, slot * 0.8);
  const each = graph.stacked ? wide : wide / list.length;
  const bases = graph.stacked
    ? stackBases(list, graph.xs.length)
    : list.map((s) => ({ s, base: graph.xs.map(() => 0) }));
  return bases.map(({ s, base }, k) => ({
    id: s.id,
    color: s.color,
    kind: 'bar',
    rects: s.values.map((v, i) => {
      const top = yAt(base[i] + Math.max(0, v));
      const bottom = yAt(base[i]);
      return {
        x: round(xAt(i) - wide / 2 + (graph.stacked ? 0 : k * each)),
        y: top,
        w: round(each),
        h: Math.max(0, round(bottom - top)),
      };
    }),
  }));
};

// A lines chart with two scales: each series against its own maximum.
const scaledLines = (graph, list, plot, xAt) =>
  list.map((s) => {
    const { min, max } = niceTicks(...Object.values(extent(graph, [s])));
    return lineShape(s, xAt, null, makeScale(plot, min, max));
  });

/**
 * What an SVG draws for the visible series: `{ plot, shapes, yTicks,
 * xTicks, xAt }`. Shapes are `{ id, color, kind: 'line' | 'area' | 'bar',
 * d | rects }`; ticks carry their position and value.
 */
export const layoutGraph = (graph, hidden = new Set(), size = SIZE) => {
  const plot = {
    left: size.left,
    top: size.top,
    w: size.width - size.left - size.right,
    h: size.height - size.top - size.bottom,
    width: size.width,
    height: size.height,
  };
  const visible = drawn(graph, shown(graph, hidden));
  const { min, max } = extent(graph, visible);
  const scale = niceTicks(min, max);
  const yAt = makeScale(plot, scale.min, scale.max);
  const xAt = (i) => round(plot.left + xRatio(graph, i) * plot.w);
  let shapes;
  if (graph.yScaled && graph.kind === 'line') {
    shapes = scaledLines(graph, visible, plot, xAt);
  } else if (graph.kind === 'bar') {
    shapes = barShapes(graph, visible, plot, xAt, yAt);
  } else if (graph.kind === 'area') {
    shapes = areaShapes(graph, visible, xAt, yAt);
  } else {
    shapes = visible.map((s) => lineShape(s, xAt, yAt));
  }
  return {
    plot,
    shapes,
    xAt,
    yTicks: scale.ticks.map((v) => ({ v, y: yAt(v) })),
    xTicks: xTickIndexes(graph.xs.length).map((i) => ({
      i,
      x: xAt(i),
      ms: graph.xs[i],
    })),
  };
};

/** Up to `count` columns spread over the chart for its x labels. */
export const xTickIndexes = (n, count = 5) => {
  if (n <= count) {
    return Array.from({ length: n }, (_, i) => i);
  }
  return Array.from({ length: count }, (_, k) =>
    Math.round((k * (n - 1)) / (count - 1))
  );
};

/**
 * The tooltip at column `i`: `{ ms, rows: [{ id, name, color, value,
 * percent? }], total? }`, the visible series only.
 */
export const tooltipOf = (graph, i, hidden = new Set()) => {
  const list = shown(graph, hidden);
  const sum = list.reduce((a, s) => a + s.values[i], 0);
  const rows = list.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    value: s.values[i],
    ...(graph.percentage && sum > 0
      ? { percent: (s.values[i] / sum) * 100 }
      : {}),
  }));
  return {
    ms: graph.xs[i],
    rows,
    ...(graph.stacked && list.length > 1 ? { total: sum } : {}),
  };
};

/** A single-moment chart as ranked shares: biggest first, with percent. */
export const shareRows = (graph, hidden = new Set()) => {
  const list = shown(graph, hidden);
  const sum = list.reduce((a, s) => a + Math.max(0, s.values[0]), 0);
  return list
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      value: s.values[0],
      percent: sum > 0 ? (Math.max(0, s.values[0]) / sum) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
};

const DATE_FORMATS = {
  day: { day: 'numeric', month: 'short', timeZone: 'UTC' },
  full: { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  hour: { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false },
};

/** Whether the chart spans no more than two days: x labels are hours. */
export const isHourly = (graph) =>
  graph.xs.length > 1 &&
  graph.xs.at(-1) - graph.xs[0] <= 2 * DAY_MS &&
  graph.xs[1] - graph.xs[0] < DAY_MS;

/** An x value (ms) as a label: 'day', 'full' (with year) or 'hour'. */
export const formatX = (ms, locale, style = 'day') => {
  try {
    return new Intl.DateTimeFormat(locale, DATE_FORMATS[style]).format(
      new Date(ms)
    );
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
};

const SUFFIXES = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** 1234 -> "1.2K", 3400000 -> "3.4M"; small numbers as they are. */
export const formatCompact = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0';
  }
  const abs = Math.abs(n);
  const hit = SUFFIXES.find(([limit]) => abs >= limit);
  if (!hit) {
    return String(Math.round(n * 10) / 10);
  }
  return `${Math.round((n / hit[0]) * 10) / 10}${hit[1]}`;
};

/** A number in the locale's grouping, at most one decimal. */
export const formatNumber = (value, locale) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0';
  }
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      n
    );
  } catch {
    return String(Math.round(n * 10) / 10);
  }
};

/** 12.345 -> "12.3%" (digits after the point, trailing zeros dropped). */
export const formatPercent = (value, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '0%';
  }
  const f = 10 ** digits;
  return `${Math.round(n * f) / f}%`;
};

/** The share `part` is of `total`, in percent (0 when total is 0). */
export const percentOf = (part, total) =>
  Number(total) > 0 ? (Number(part) / Number(total)) * 100 : 0;

/**
 * How a figure moved from the previous period: `{ delta, percent,
 * direction }`, percent null when there was nothing before.
 */
export const changeOf = (current, previous) => {
  const delta = (Number(current) || 0) - (Number(previous) || 0);
  const before = Number(previous) || 0;
  return {
    delta,
    percent: before === 0 ? null : (delta / Math.abs(before)) * 100,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
  };
};

/** A change as text: "+1.2K (3.4%)", "-300 (5%)", "0". */
export const formatChange = (current, previous) => {
  const { delta, percent, direction } = changeOf(current, previous);
  if (direction === 'same') {
    return '0';
  }
  const sign = delta > 0 ? '+' : '-';
  const body = `${sign}${formatCompact(Math.abs(delta))}`;
  return percent === null
    ? body
    : `${body} (${formatPercent(Math.abs(percent))})`;
};
