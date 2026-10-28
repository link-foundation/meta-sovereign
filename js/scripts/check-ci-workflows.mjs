#!/usr/bin/env node
// Keep new check jobs in the terminal gate, so adding a job cannot bypass release.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
const workflow = parse(
  readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8'
  )
);
const writers = new Set(['release', 'instant-release', 'changeset-pr']);
const checks = Object.keys(workflow.jobs).filter(
  (name) => !writers.has(name) && name !== 'pipeline-status'
);
assert.deepEqual(
  [...workflow.jobs['pipeline-status'].needs].sort(),
  checks.sort(),
  'Every check job must gate release'
);
for (const name of ['release', 'instant-release']) {
  assert.ok(
    workflow.jobs[name].needs.includes('pipeline-status'),
    `${name} must wait for the terminal status`
  );
}
for (const job of Object.values(workflow.jobs)) {
  assert.ok(job['timeout-minutes'] > 0, 'Every job needs a finite timeout');
}
console.log(`${checks.length} check jobs feed the terminal release gate`);
