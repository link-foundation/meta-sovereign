// Issue #29 / R-V16: the CV API. The catalogue and the plans answer
// without a browser; read/sync drive one through an injected
// commander, and the telemetry endpoint replays what a run recorded.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'test-anywhere';

import { createFakeCommander } from './helpers/fake-commander.js';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';

const stateJson = readFileSync(
  fileURLToPath(
    new URL('./fixtures/habr-career-profile-state.json', import.meta.url)
  ),
  'utf8'
);

const SSR = 'script[type="application/json"][data-ssr-state="true"]';

const habrCommander = () =>
  createFakeCommander({
    pages: {
      'https://career.habr.com/anna': {
        nodes: {
          [SSR]: [{ text: stateJson }],
          '.page-title__title': [{ text: 'Анна Буянова' }],
          '.skills-list-show-item--profile': [{ text: 'Ruby' }],
          body: [{ text: '', html: '<body><div>cv</div></body>' }],
        },
      },
    },
  });

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

const post = (base, path, body) =>
  fetchJson(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const withServer = async (options, fn) => {
  const store = options.store ?? createMemoryStore();
  const handle = await startServer({
    port: 0,
    store,
    enableHandlers: false,
    enableSync: false,
    ...options,
  });
  try {
    return await fn(`http://127.0.0.1:${handle.port}`, store);
  } finally {
    await handle.close();
  }
};

describe('cv api catalogue', () => {
  it('lists every platform the issue names', async () => {
    await withServer({}, async (base) => {
      const { status, body } = await fetchJson(`${base}/api/cv/platforms`);
      expect(status).toBe(200);
      const ids = body.map((platform) => platform.id);
      for (const id of [
        'linkedin',
        'hh',
        'habr-career',
        'naukri',
        'vietnamworks',
        'topcv',
      ]) {
        expect(ids.includes(id)).toBe(true);
      }
    });
  });

  it('returns a dry-run plan with its evidence', async () => {
    await withServer({}, async (base) => {
      const { body } = await fetchJson(
        `${base}/api/cv/plan?platform=vietnamworks`
      );
      expect(body.platform).toBe('vietnamworks');
      expect(body.read[0].action).toBe('goto');
      expect(body.evidence.length).toBeGreaterThan(0);
    });
  });

  it('reports an unknown platform as a 400 listing the known ids', async () => {
    await withServer({}, async (base) => {
      const { status, body } = await fetchJson(
        `${base}/api/cv/plan?platform=x`
      );
      expect(status).toBe(400);
      expect(body.error).toContain('Unknown CV platform');
      expect(body.error).toContain('topcv');
    });
  });
});

describe('cv api live routes', () => {
  it('reads a platform, stores the snapshot and serves it back', async () => {
    await withServer({ cv: { commander: habrCommander() } }, async (base) => {
      const read = await post(base, '/api/cv/read', {
        platforms: ['habr-career'],
        vars: { login: 'anna' },
      });
      expect(read.status).toBe(200);
      expect(read.body.failures).toEqual([]);
      expect(read.body.entries[0].cv.basics.name).toBe('Анна Буянова');
      expect(read.body.entries[0].fields).toBeGreaterThan(0);

      const stored = await fetchJson(
        `${base}/api/cv/stored?platforms=habr-career`
      );
      expect(stored.body.entries[0].platform).toBe('habr-career');
      expect(stored.body.entries[0].cv.basics.name).toBe('Анна Буянова');
    });
  });

  it('compares stored snapshots and reports the conflicts', async () => {
    await withServer({ cv: { commander: habrCommander() } }, async (base) => {
      const compare = await post(base, '/api/cv/compare', {
        entries: [
          { platform: 'linkedin', cv: { basics: { name: 'Anna', city: '' } } },
          { platform: 'hh', cv: { basics: { name: 'Anna B.' } } },
        ],
      });
      expect(compare.status).toBe(200);
      const row = compare.body.comparison.rows.find(
        (r) => r.path === 'basics.name'
      );
      expect(row.conflict).toBe(true);
      expect(compare.body.diffs.length).toBe(2);
    });
  });

  it('plans a sync without touching a live profile by default', async () => {
    await withServer({ cv: { commander: habrCommander() } }, async (base) => {
      const sync = await post(base, '/api/cv/sync', {
        platforms: ['habr-career'],
        vars: { login: 'anna' },
      });
      expect(sync.body.dryRun).toBe(true);
      expect(sync.body.applied).toEqual([]);
      expect(sync.body.actions.length).toBe(1);
      expect(sync.body.target.basics.name).toBe('Анна Буянова');
    });
  });

  it('serves the telemetry a run recorded', async () => {
    await withServer({ cv: { commander: habrCommander() } }, async (base) => {
      await post(base, '/api/cv/read', {
        platforms: ['habr-career'],
        vars: { login: 'anna' },
      });
      const { body } = await fetchJson(`${base}/api/cv/telemetry`);
      expect(body.runs.length).toBe(1);
      expect(body.runs[0].platform).toBe('habr-career');
      expect(body.runs[0].counts['run.start']).toBe(1);
      expect(body.events.some((e) => e.type === 'markup.fingerprint')).toBe(
        true
      );

      const filtered = await fetchJson(
        `${base}/api/cv/telemetry?type=run.finish`
      );
      expect(filtered.body.events.length).toBe(1);
      expect(filtered.body.events[0].type).toBe('run.finish');
    });
  });

  it('reports a failed platform without hiding the rest', async () => {
    await withServer({ cv: { commander: habrCommander() } }, async (base) => {
      const read = await post(base, '/api/cv/read', {
        platforms: ['habr-career', 'linkedin'],
        vars: { login: 'anna' },
      });
      expect(read.body.entries.length).toBe(1);
      expect(read.body.failures[0].platform).toBe('linkedin');
      expect(typeof read.body.failures[0].code).toBe('string');
    });
  });
});
