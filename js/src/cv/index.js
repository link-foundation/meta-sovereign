/**
 * CV synchronisation facade (R-V15).
 *
 * Everything below composes the four layers that live next to it:
 * the canonical model, the keyed diff, the declarative platform plans
 * and the plan runner. Callers — CLI, server, SPA, tests — only ever
 * touch this module, so "read one", "read all", "compare" and "push
 * the reconciled values back" behave identically everywhere.
 *
 * Nothing here needs a browser unless a live run is requested: a
 * commander can be injected, which is how the whole flow is tested.
 */

import {
  applyFlatChanges,
  compareCvs,
  cvsEqual,
  diffCv,
  formatDiff,
  reconcileCvs,
} from './diff.js';
import {
  cvFieldCount,
  cvFromLink,
  cvLinkId,
  cvToLink,
  emptyCv,
  normalizeCv,
} from './model.js';
import {
  combineSinks,
  createMemorySink,
  createStoreSink,
} from './telemetry.js';
import { getCvPlatform, listCvPlatforms } from './platforms/index.js';
import { createCvRunner } from './runner.js';
import { openBrowserSession } from './browser.js';

export {
  BROWSER_PACKAGES,
  BrowserUnavailableError,
  browserAvailability,
  defaultProfileDir,
  openBrowserSession,
  withBrowserSession,
} from './browser.js';
export * from './diff.js';
export * from './model.js';
export * from './telemetry.js';
export {
  cvPlatformCatalogue,
  describeCvPlatform,
  getCvPlatform,
  listCvPlatforms,
  validateCvPlatforms,
} from './platforms/index.js';
export { createCvRunner, dryRunPlan } from './runner.js';

const sinkFor = ({ store, sink, recordTelemetry }) => {
  const memory = createMemorySink();
  if (!store || recordTelemetry === false) {
    return sink ? combineSinks(memory, sink) : memory;
  }
  const storeSink = createStoreSink(store);
  return sink
    ? combineSinks(memory, storeSink, sink)
    : combineSinks(memory, storeSink);
};

/**
 * Obtain a commander: use the injected one, or open a browser session
 * bound to this platform's persistent profile.
 */
const withCommander = async (platform, options, fn) => {
  if (options.commander) {
    return fn(options.commander);
  }
  const open = options.openSession ?? openBrowserSession;
  const session = await open({
    platform: platform.id,
    headless: options.headless ?? true,
    profileDir: options.profileDir ?? null,
    locale: options.locale ?? `${platform.locales[0]}-${platform.region}`,
    verbose: options.verbose ?? false,
  });
  try {
    return await fn(session.commander);
  } finally {
    await session.close();
  }
};

/**
 * Read one platform's CV.
 *
 * @param {string} platformId registry id, e.g. `linkedin`
 * @param {object} [options]
 * @param {object} [options.commander] pre-opened browser-commander
 * @param {object} [options.store] store to persist the snapshot into
 * @param {object} [options.vars] template variables (`login`, …)
 * @param {object} [options.baseline] previous fingerprints, for drift
 * @param {string} [options.artifactDir] where to write HTML/screenshots
 * @returns {Promise<{platform: string, cv: object, url: string|null, warnings: string[], report: object, fields: number}>}
 */
export const readCvFrom = async (platformId, options = {}) => {
  const platform = getCvPlatform(platformId);
  const result = await withCommander(platform, options, (commander) =>
    createCvRunner({
      platform,
      commander,
      vars: options.vars ?? {},
      sink: sinkFor(options),
      baseline: options.baseline ?? {},
      artifactDir: options.artifactDir ?? null,
    }).read()
  );
  if (options.store && options.save !== false) {
    await options.store.put(
      cvToLink({
        platform: platform.id,
        cv: result.cv,
        url: result.url,
        warnings: result.warnings,
      })
    );
  }
  return { ...result, fields: cvFieldCount(result.cv) };
};

/**
 * Read several platforms in sequence. One platform failing (expired
 * session, markup drift) never hides the others: failures are
 * returned alongside the successful snapshots.
 *
 * @param {string[]} [platformIds] defaults to the whole registry
 * @param {object} [options] as {@link readCvFrom}
 * @returns {Promise<{entries: object[], failures: object[]}>}
 */
export const readAllCvs = async (
  platformIds = listCvPlatforms(),
  options = {}
) => {
  const entries = [];
  const failures = [];
  for (const id of platformIds) {
    try {
      entries.push(await readCvFrom(id, options));
    } catch (error) {
      failures.push({
        platform: id,
        code: error.code ?? 'error',
        message: error.message,
      });
    }
  }
  return { entries, failures };
};

/** Load every CV snapshot a store holds, newest values as written. */
export const loadStoredCvs = async (store, platformIds = null) => {
  const ids = platformIds ?? listCvPlatforms();
  const entries = [];
  for (const id of ids) {
    const link = await store.get(cvLinkId(id));
    if (link) {
      entries.push({
        platform: id,
        cv: cvFromLink(link),
        capturedAt: link.capturedAt ?? null,
        url: link.url ?? null,
      });
    }
  }
  return entries;
};

/**
 * Compare CV snapshots across platforms and derive what each platform
 * would need to change to converge.
 *
 * @param {Array<{platform: string, cv: object, capturedAt?: string}>} entries
 * @param {{prefer?: string|null}} [options] platform that wins ties
 */
export const compareAllCvs = (entries = [], { prefer = null } = {}) => {
  const matrix = compareCvs(entries);
  const plan = reconcileCvs(entries, { prefer });
  const updates = {};
  for (const item of plan) {
    for (const platform of item.appliesTo) {
      (updates[platform] ??= []).push({
        path: item.path,
        value: item.value,
        source: item.source,
        conflict: item.conflict,
      });
    }
  }
  return {
    ...matrix,
    plan,
    updates,
    agreed: matrix.rows.filter(
      (row) => !row.conflict && row.missing.length === 0
    ).length,
  };
};

/**
 * Pairwise diffs, one per platform against the canonical snapshot
 * (or against each other when no canonical CV is supplied).
 * @param {Array<{platform: string, cv: object}>} entries
 * @param {object|null} [canonical]
 */
export const diffAllCvs = (entries = [], canonical = null) => {
  const base = canonical ? normalizeCv(canonical) : null;
  return entries.map((entry, index) => {
    const left = base ?? normalizeCv(entries[index === 0 ? 1 : 0]?.cv ?? {});
    const changes = diffCv(left, entry.cv);
    return {
      platform: entry.platform,
      against: canonical
        ? 'canonical'
        : (entries[index === 0 ? 1 : 0]?.platform ?? null),
      changes,
      equal: changes.length === 0,
      patch: formatDiff(changes),
    };
  });
};

/**
 * Write a CV to one platform.
 *
 * @param {string} platformId
 * @param {object} cv canonical CV to push
 * @param {object} [options] `paths`/`groups` filters plus the options
 *   of {@link readCvFrom}
 */
export const updateCvOn = async (platformId, cv, options = {}) => {
  const platform = getCvPlatform(platformId);
  return withCommander(platform, options, (commander) =>
    createCvRunner({
      platform,
      commander,
      vars: options.vars ?? {},
      sink: sinkFor(options),
      baseline: options.baseline ?? {},
      artifactDir: options.artifactDir ?? null,
    }).update(cv, {
      paths: options.paths ?? null,
      groups: options.groups ?? null,
    })
  );
};

const writablePaths = (platform, changes) =>
  changes.filter((change) =>
    platform.writePaths.some(
      (guarded) =>
        change.path === guarded ||
        change.path.startsWith(`${guarded}.`) ||
        change.path.startsWith(`${guarded}[`)
    )
  );

/**
 * Read every requested platform, reconcile the differences and push
 * the agreed values back to the platforms that disagree.
 *
 * `dryRun` (the default) stops after the plan, which is what the CLI
 * and the SPA show before anyone touches a live profile.
 *
 * @param {string[]} [platformIds]
 * @param {object} [options]
 * @param {boolean} [options.dryRun] default true
 * @param {string|null} [options.prefer] platform whose values win ties
 * @param {object|null} [options.canonical] CV to push instead of a
 *   reconciled one — use when the user edited a CV locally
 */
const changesFor = (id, { canonical, target, entries, comparison }) => {
  if (canonical) {
    const current = entries.find((entry) => entry.platform === id);
    return diffCv(current?.cv ?? emptyCv(), target);
  }
  return (comparison.updates[id] ?? []).map((update) => ({
    path: update.path,
    kind: 'changed',
    right: update.value,
  }));
};

const syncActions = (platformIds, context) =>
  platformIds.map((id) => {
    const platform = getCvPlatform(id);
    const changes = changesFor(id, context);
    const writable = writablePaths(platform, changes);
    const seen = context.entries.some((entry) => entry.platform === id);
    return {
      platform: id,
      pending: changes.length,
      writable: writable.length,
      unsupported: changes.length - writable.length,
      paths: [...new Set(writable.map((change) => change.path))],
      skipped: seen || context.canonical ? null : 'no snapshot read',
    };
  });

const applyActions = async (actions, target, options, failures) => {
  const applied = [];
  for (const action of actions.filter((item) => item.writable > 0)) {
    try {
      applied.push(
        await updateCvOn(action.platform, target, {
          ...options,
          paths: action.paths,
        })
      );
    } catch (error) {
      failures.push({
        platform: action.platform,
        code: error.code ?? 'error',
        message: error.message,
      });
    }
  }
  return applied;
};

/**
 * Read every requested platform, reconcile the differences and push
 * the agreed values back to the platforms that disagree.
 *
 * `dryRun` (the default) stops after the plan, which is what the CLI
 * and the SPA show before anyone touches a live profile.
 *
 * @param {string[]} [platformIds]
 * @param {object} [options]
 * @param {boolean} [options.dryRun] default true
 * @param {string|null} [options.prefer] platform whose values win ties
 * @param {object|null} [options.canonical] CV to push instead of a
 *   reconciled one - use when the user edited a CV locally
 */
export const syncCvAcross = async (
  platformIds = listCvPlatforms(),
  options = {}
) => {
  const { dryRun = true, prefer = null, canonical = null } = options;
  const { entries, failures } = await readAllCvs(platformIds, options);
  const comparison = compareAllCvs(entries, { prefer });
  const target = canonical
    ? normalizeCv(canonical)
    : applyFlatChanges(
        emptyCv(),
        comparison.plan.map((item) => ({ path: item.path, value: item.value }))
      );
  const actions = syncActions(platformIds, {
    canonical,
    target,
    entries,
    comparison,
  });
  const applied = dryRun
    ? []
    : await applyActions(actions, target, options, failures);
  return {
    dryRun,
    target,
    entries,
    failures,
    comparison,
    actions,
    applied,
    inSync:
      entries.length > 1 &&
      entries.every((entry) => cvsEqual(entry.cv, target)),
  };
};
