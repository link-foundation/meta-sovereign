/** Shared CV calls, preserving legacy offline behavior and private acknowledgements. */
import { createExperienceApi } from './cv-experience-api.js';

/** Offline answer shared by every live CV call. */
const cvOffline = (platforms) => ({
  platform: (platforms ?? []).join(',') || 'all',
  code: 'server-required',
  message: 'the local server drives the browser for CV reads and writes',
});

export const createCvApi = ({
  serverFetch,
  postJson,
  serverPostConfirmed,
  serverReadReport,
  serverPostReport,
}) => ({
  cvPlatforms: async () => (await serverFetch('/api/cv/platforms')) ?? [],
  cvPlan: async (platform) =>
    (await serverFetch(
      `/api/cv/plan?platform=${encodeURIComponent(platform)}`
    )) ?? null,
  cvStored: async (platforms = []) =>
    (await serverFetch(
      `/api/cv/stored${platforms.length ? `?platforms=${encodeURIComponent(platforms.join(','))}` : ''}`
    )) ?? { entries: [] },
  cvRead: async ({ platforms, vars = {} } = {}) =>
    (await postJson('/api/cv/read', { platforms, vars })) ?? {
      entries: [],
      failures: [cvOffline(platforms)],
    },
  cvCompare: async ({ platforms, entries, prefer = null } = {}) =>
    (await postJson('/api/cv/compare', { platforms, entries, prefer })) ?? {
      entries: [],
      comparison: { rows: [], plan: [], updates: {}, agreed: 0 },
      diffs: [],
    },
  // A dry run returns `confirm.token` for applying exactly its plan;
  // applying passes it back (`ask` covers an expired token).
  cvSync: async ({
    platforms,
    dryRun = true,
    prefer = null,
    vars = {},
    confirmToken,
    ask,
  } = {}) =>
    (dryRun
      ? await postJson('/api/cv/sync', { platforms, dryRun, prefer, vars })
      : await serverPostConfirmed(
          '/api/cv/sync',
          { platforms, dryRun, prefer, vars, confirmToken },
          ask
        )) ?? {
      dryRun,
      actions: [],
      applied: [],
      entries: [],
      failures: [cvOffline(platforms)],
    },
  cvTelemetry: async ({
    runId = null,
    platform = null,
    type = null,
    limit = 200,
  } = {}) => {
    const search = new URLSearchParams({ limit: String(limit) });
    for (const [key, value] of Object.entries({ runId, platform, type })) {
      if (value) {
        search.set(key, value);
      }
    }
    return (
      (await serverFetch(`/api/cv/telemetry?${search}`)) ?? {
        runs: [],
        events: [],
      }
    );
  },
  ...createExperienceApi({ get: serverReadReport, report: serverPostReport }),
});
