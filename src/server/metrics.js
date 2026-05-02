/**
 * Prometheus exposition for the local server (ROADMAP §7).
 *
 * Returned in the OpenMetrics text format so any standard scraper
 * (Prometheus, OpenTelemetry collector, vector.dev) can consume it
 * with no extra parsing. Metrics are intentionally minimal: link
 * counts by prefix, store size, sync peer counts, signaling rooms.
 *
 *   GET /metrics
 *
 * Always served — but only useful for headless deployments. The SPA
 * itself does not scrape itself; this is for the `npm run docker:*`
 * runs inside larger fleets.
 */

import { text } from './util.js';

const metric = (name, help, type, samples) => {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  for (const [labels, value] of samples) {
    const l = labels ? `{${labels}}` : '';
    lines.push(`${name}${l} ${value}`);
  }
  return lines.join('\n');
};

const countByPrefix = (links, prefix) =>
  links.filter((l) => typeof l.id === 'string' && l.id.startsWith(prefix))
    .length;

export const collectMetrics = async (store, { sync, signaling } = {}) => {
  const all = await store.query();
  const peers = sync?.socketCount?.() ?? 0;
  const rooms = signaling?.rooms?.() ?? [];
  const blocks = [
    metric('meta_sovereign_links_total', 'Total links in the store.', 'gauge', [
      [null, all.length],
    ]),
    metric(
      'meta_sovereign_links_by_kind',
      'Links grouped by id prefix (msg, pattern, graph, reply, ...).',
      'gauge',
      [
        ['kind="message"', countByPrefix(all, 'msg:')],
        ['kind="pattern"', countByPrefix(all, 'pattern:')],
        ['kind="graph"', countByPrefix(all, 'graph:')],
        ['kind="reply"', countByPrefix(all, 'reply:')],
        ['kind="broadcast"', countByPrefix(all, 'broadcast:')],
        ['kind="contact"', countByPrefix(all, 'contact:')],
        ['kind="profile"', countByPrefix(all, 'profile:')],
        ['kind="resume"', countByPrefix(all, 'resume:')],
        ['kind="secret"', countByPrefix(all, 'secret:')],
      ]
    ),
    metric(
      'meta_sovereign_ws_peers',
      'Connected WebSocket sync peers.',
      'gauge',
      [[null, peers]]
    ),
    metric(
      'meta_sovereign_rtc_rooms',
      'Active WebRTC signaling rooms.',
      'gauge',
      [[null, rooms.length]]
    ),
  ];
  return `${blocks.join('\n')}\n`;
};

export const handleMetrics = async (
  store,
  req,
  res,
  p,
  { sync, signaling } = {}
) => {
  if (p !== '/metrics' || req.method !== 'GET') {
    return false;
  }
  const body = await collectMetrics(store, { sync, signaling });
  text(res, 200, body, 'text/plain; version=0.0.4');
  return true;
};
