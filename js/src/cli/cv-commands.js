/**
 * CV subcommands (issue #29, R-V17).
 *
 * The terminal gets the same surface as the HTTP API: the catalogue
 * and the dry-run plans answer without a browser, `cv-read`/`cv-sync`
 * drive one through the facade, and `cv-telemetry` replays what a run
 * recorded so a failed live run is debuggable after the fact.
 *
 * The command map is built by a factory so the CLI entry point injects
 * its own `openStore` (and the tests inject a fake commander) without
 * this module importing the entry point back.
 */

import {
  compareAllCvs,
  cvPlatformCatalogue,
  diffAllCvs,
  dryRunPlan,
  getCvPlatform,
  listCvPlatforms,
  loadCvTelemetry,
  loadStoredCvs,
  readAllCvs,
  summarizeCvRuns,
  syncCvAcross,
} from '../cv/index.js';

export const CV_HELP = `  cv-platforms  [--json]
  cv-plan       --platform=<id> [--json]
  cv-read       --platforms=<a,b> [--login=<l>] [--vars=<json>] [--headed] [--profile=<dir>] [--artifacts=<dir>] [--no-save] [--store=<dir>]
  cv-diff       [--platforms=<a,b>] [--prefer=<id>] [--json] [--store=<dir>]
  cv-sync       [--platforms=<a,b>] [--apply] [--prefer=<id>] [--login=<l>] [--vars=<json>] [--headed] [--store=<dir>]
  cv-telemetry  [--run=<id>] [--platform=<id>] [--type=<event>] [--limit=<n>] [--json] [--store=<dir>]`;

/** `--platforms=a,b` (or repeated commas) — defaults to every platform. */
export const parsePlatforms = (value) => {
  const ids =
    typeof value === 'string' && value.trim()
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : listCvPlatforms();
  for (const id of ids) {
    // Throws listing the known ids, which the CLI prints as an error.
    getCvPlatform(id);
  }
  return ids;
};

/**
 * Template variables for a plan: `--vars` takes a JSON object and
 * `--login` is the shorthand every platform's profile URL needs.
 */
export const parseVars = (args) => {
  const vars = args.vars ? JSON.parse(args.vars) : {};
  for (const key of ['login', 'resumeId', 'profileId']) {
    if (args[key]) {
      vars[key] = args[key];
    }
  }
  return vars;
};

const flagOff = (value) => value === false || value === 'false';

/** Options every live command shares. */
const liveOptions = (args, store, extra) => ({
  store,
  vars: parseVars(args),
  headless: !(args.headed === true || args.headed === 'true'),
  profileDir: args.profile ?? null,
  artifactDir: args.artifacts ?? null,
  save: !(args['no-save'] === true || flagOff(args.save)),
  recordTelemetry: !flagOff(args.telemetry),
  ...extra,
});

const asJson = (value) => JSON.stringify(value, null, 2);

const reportFailures = (failures, log) => {
  for (const failure of failures ?? []) {
    log(`! ${failure.platform}: ${failure.code} — ${failure.message}`);
  }
  return failures?.length ? 1 : 0;
};

const platformsCmd = async (args, log) => {
  const catalogue = cvPlatformCatalogue();
  if (args.json) {
    log(asJson(catalogue));
    return 0;
  }
  for (const platform of catalogue) {
    log(
      `${platform.id}\t${platform.label}\t${platform.markupAccess}\t` +
        `read ${platform.readPaths.length} paths, write ${platform.writePaths.length}\t` +
        `${platform.confidence.verified} verified / ` +
        `${platform.confidence.draft} draft steps`
    );
  }
  return 0;
};

const planCmd = async (args, log) => {
  const plan = dryRunPlan(getCvPlatform(args.platform ?? ''));
  if (args.json) {
    log(asJson(plan));
    return 0;
  }
  log(
    `${plan.platform}: ${plan.label} — ${plan.read.length} read steps, ` +
      `${plan.update.length} write groups, markup ${plan.markupAccess}`
  );
  for (const step of plan.read) {
    log(
      `  read   ${step.action}\t${step.target ?? ''}\t[${step.confidence}]${
        step.optional ? '\t(optional)' : ''
      }`
    );
  }
  for (const group of plan.update) {
    log(`  write  ${group.id}\t${group.paths.join(', ')}`);
  }
  for (const item of plan.evidence) {
    log(`  source ${item}`);
  }
  return 0;
};

const readCmd = async (args, log, openStore, injected) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const ids = parsePlatforms(args.platforms);
  const { entries, failures } = await readAllCvs(
    ids,
    liveOptions(args, store, injected)
  );
  if (args.json) {
    log(asJson({ entries, failures }));
    return failures.length ? 1 : 0;
  }
  for (const entry of entries) {
    log(
      `${entry.platform}\t${entry.fields} fields\t${entry.url ?? ''}${
        entry.warnings.length ? `\t(${entry.warnings.length} warnings)` : ''
      }`
    );
  }
  return reportFailures(failures, log);
};

const diffCmd = async (args, log, openStore) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const entries = await loadStoredCvs(store, parsePlatforms(args.platforms));
  const comparison = compareAllCvs(entries, { prefer: args.prefer ?? null });
  const diffs = diffAllCvs(entries, null);
  if (args.json) {
    log(asJson({ entries, comparison, diffs }));
    return 0;
  }
  if (entries.length === 0) {
    log('no stored CV snapshots — run cv-read first');
    return 1;
  }
  log(`platforms: ${entries.map((entry) => entry.platform).join(', ')}`);
  log(`agreed on ${comparison.agreed} of ${comparison.rows.length} fields`);
  for (const row of comparison.rows.filter(
    (item) => item.conflict || item.missing.length
  )) {
    const values = Object.entries(row.values)
      .map(([platform, value]) => `${platform}=${JSON.stringify(value)}`)
      .join(' ');
    log(
      `  ${row.conflict ? '≠' : '·'} ${row.path}\t${values}${
        row.missing.length ? `\tmissing: ${row.missing.join(',')}` : ''
      }`
    );
  }
  return 0;
};

const syncCmd = async (args, log, openStore, injected) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const ids = parsePlatforms(args.platforms);
  const result = await syncCvAcross(ids, {
    ...liveOptions(args, store, injected),
    dryRun: !(args.apply === true || args.apply === 'true'),
    prefer: args.prefer ?? null,
  });
  if (args.json) {
    log(asJson(result));
    return result.failures.length ? 1 : 0;
  }
  log(result.dryRun ? 'dry run — nothing was written' : 'applying changes');
  for (const action of result.actions) {
    log(`  ${action.platform}\t${action.paths.join(', ')}`);
  }
  for (const applied of result.applied) {
    log(
      `  applied ${applied.platform}\t${(applied.applied ?? []).join(', ')}${
        (applied.warnings ?? []).length
          ? `\t(${applied.warnings.length} warnings)`
          : ''
      }`
    );
  }
  return reportFailures(result.failures, log);
};

const telemetryCmd = async (args, log, openStore) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const events = await loadCvTelemetry(store, {
    runId: args.run ?? null,
    platform: args.platform ?? null,
    type: args.type ?? null,
    limit: Number(args.limit ?? 500),
  });
  if (args.json) {
    log(asJson({ runs: summarizeCvRuns(events), events }));
    return 0;
  }
  for (const run of summarizeCvRuns(events)) {
    const counts = Object.entries(run.counts)
      .map(([type, n]) => `${type}=${n}`)
      .join(' ');
    log(`${run.runId}\t${run.platform}\t${run.mode}\t${counts}`);
    for (const problem of run.problems) {
      log(`  ! ${problem}`);
    }
  }
  return 0;
};

/**
 * An unknown platform or a missing browser is a user-facing message,
 * not a stack trace: report it on the CLI's log and exit non-zero.
 */
const guarded = (fn) => async (args, log) => {
  try {
    return await fn(args, log);
  } catch (error) {
    log(`error: ${error.message}`);
    if (error.code === 'browser-unavailable') {
      log(`install: npm i ${(error.missing ?? []).join(' ')}`);
    }
    return 1;
  }
};

/**
 * @param {object} deps
 * @param {Function} deps.openStore directory → store
 * @param {object} [deps.live] injected `commander`/`openSession` for tests
 */
export const createCvCommands = ({ openStore, live = {} }) =>
  Object.fromEntries(
    Object.entries({
      'cv-platforms': platformsCmd,
      'cv-plan': planCmd,
      'cv-read': (args, log) => readCmd(args, log, openStore, live),
      'cv-diff': (args, log) => diffCmd(args, log, openStore),
      'cv-sync': (args, log) => syncCmd(args, log, openStore, live),
      'cv-telemetry': (args, log) => telemetryCmd(args, log, openStore),
    }).map(([name, fn]) => [name, guarded(fn)])
  );
