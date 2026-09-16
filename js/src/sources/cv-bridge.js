/**
 * Bridge between the message-source registry and the CV plans (R-E11).
 *
 * Every job board in the registry also owns a declarative CV plan in
 * `js/src/cv/platforms`. Wiring them together here means a caller that
 * already holds a source adapter can read or update the resume behind
 * it without knowing whether the board offers an HTTP API (hh.ru,
 * SuperJob) or only a browser session (Naukri, VietnamWorks, TopCV).
 *
 * The CV modules are imported lazily so that loading the registry —
 * which the CLI and the server do on every start — never pulls in the
 * browser stack.
 */

import { getCvPlatform } from '../cv/platforms/index.js';

/** Resolve the CV platform id a source maps to. */
export const cvPlatformIdOf = (source) =>
  typeof source === 'string' ? source : (source?.cvPlatform ?? source?.name);

/**
 * The CV plan behind a source adapter.
 * @param {object|string} source adapter or its name
 * @throws when the source has no CV plan registered
 */
export const cvPlatformOf = (source) => getCvPlatform(cvPlatformIdOf(source));

const cvModule = () => import('../cv/index.js');

/**
 * Read a source's resume through its declarative CV plan.
 * @param {object|string} source adapter or its name
 * @param {object} [options] as `readCvFrom` (commander, store, vars, …)
 */
export const readSourceCv = async (source, options = {}) => {
  const { readCvFrom } = await cvModule();
  return readCvFrom(cvPlatformIdOf(source), options);
};

/**
 * Push a resume to a source through its declarative CV plan. The input
 * is normalised first, so partial resumes (`{basics: {summary}}`) are
 * accepted exactly like full canonical CVs.
 * @param {object|string} source adapter or its name
 * @param {object} cv canonical (or partial) CV
 * @param {object} [options] as `updateCvOn` (`paths`, `groups`, …)
 */
export const writeSourceCv = async (source, cv, options = {}) => {
  const { normalizeCv, updateCvOn } = await cvModule();
  return updateCvOn(cvPlatformIdOf(source), normalizeCv(cv), options);
};

/**
 * Decorate a source adapter with its CV plan. The original adapter is
 * left untouched: `syncResume` keeps whatever API-backed behaviour it
 * had, and `readResume`/`writeResume` are added on top.
 * @param {object} source adapter
 * @param {string} [platformId] defaults to the adapter's name
 */
export const withCvPlatform = (source, platformId = source.name) => {
  // Fails fast at import time if a source claims a plan that is gone.
  getCvPlatform(platformId);
  const decorated = {
    ...source,
    cvPlatform: platformId,
    readResume: (options = {}) => readSourceCv(platformId, options),
    writeResume: (cv, options = {}) => writeSourceCv(platformId, cv, options),
  };
  return decorated;
};
