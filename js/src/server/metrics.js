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
import { scanLinks } from './store-scan.js';

const metric = (name, help, type, samples) => {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  for (const [labels, value] of samples) {
    const l = labels ? `{${labels}}` : '';
    lines.push(`${name}${l} ${value}`);
  }
  return lines.join('\n');
};

export const collectMetrics = async (store, { sync, signaling } = {}) => {
  let count = 0;
  const kinds = new Map();
  await scanLinks(
    store,
    null,
    (batch) => {
      count += batch.length;
      for (const id of batch) {
        const kind = String(id).split(':', 1)[0];
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
    },
    (link) => link.id
  );
  const countByPrefix = (prefix) => kinds.get(prefix) ?? 0;
  const peers = sync?.socketCount?.() ?? 0;
  const rooms = signaling?.rooms?.() ?? [];
  const blocks = [
    metric('meta_sovereign_links_total', 'Total links in the store.', 'gauge', [
      [null, count],
    ]),
    metric(
      'meta_sovereign_links_by_kind',
      'Links grouped by id prefix (msg, pattern, graph, reply, ...).',
      'gauge',
      [
        ['kind="message"', countByPrefix('msg')],
        ['kind="pattern"', countByPrefix('pattern')],
        ['kind="graph"', countByPrefix('graph')],
        ['kind="reply"', countByPrefix('reply')],
        ['kind="broadcast"', countByPrefix('broadcast')],
        ['kind="contact"', countByPrefix('contact')],
        ['kind="profile"', countByPrefix('profile')],
        ['kind="resume"', countByPrefix('resume')],
        ['kind="secret"', countByPrefix('secret')],
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
