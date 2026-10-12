#!/usr/bin/env node

// js/scripts/desktop-release-gate.mjs
//
// Decide whether the desktop release may run after a "Checks and
// release" run on main that did not succeed (issue #37). The release
// job commits the new version to main *before* `Publish to npm`, so
// when npm publishing is the only failure the version is final and
// desktop users should still get their installers on the GitHub
// release. Any other failure (tests, lint, the version commit) stops
// the desktop build.
//
// Usage:
//   gh api repos/OWNER/REPO/actions/runs/RUN_ID/jobs --paginate \
//     | node js/scripts/desktop-release-gate.mjs
//
// Prints `build=true|false` (for $GITHUB_OUTPUT) and a reason on stderr.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Steps whose failure does not block the desktop release. */
export const TOLERATED_FAILED_STEPS = Object.freeze(['Publish to npm']);

/**
 * @param {Array<{name: string, conclusion: string|null,
 *   steps?: Array<{name: string, conclusion: string|null}>}>} jobs
 * @returns {{build: boolean, reason: string}}
 */
export const desktopReleaseGate = (jobs) => {
  const failedJobs = jobs.filter(
    (job) => job.conclusion !== 'success' && job.conclusion !== 'skipped'
  );
  if (failedJobs.length === 0) {
    return { build: true, reason: 'every job succeeded' };
  }
  const blocking = [];
  for (const job of failedJobs) {
    const failedSteps = (job.steps ?? []).filter(
      (step) => step.conclusion === 'failure'
    );
    // A cancelled or timed-out job has no failed step to excuse it.
    if (job.conclusion !== 'failure' || failedSteps.length === 0) {
      blocking.push(`${job.name} (${job.conclusion})`);
    }
    for (const step of failedSteps) {
      if (!TOLERATED_FAILED_STEPS.includes(step.name)) {
        blocking.push(`${job.name} / ${step.name}`);
      }
    }
  }
  return blocking.length
    ? { build: false, reason: `blocked by ${blocking.join(', ')}` }
    : { build: true, reason: 'only npm publishing failed' };
};

/** `gh api --paginate` concatenates one `{total_count, jobs}` per page. */
export const parseJobPages = (text) =>
  String(text)
    .split(/(?<=\})\s*(?=\{"total_count")/)
    .filter((page) => page.trim())
    .flatMap((page) => JSON.parse(page).jobs ?? []);

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { build, reason } = desktopReleaseGate(
    parseJobPages(readFileSync(0, 'utf8'))
  );
  console.error(`desktop release gate: ${reason}`);
  console.log(`build=${build}`);
}
