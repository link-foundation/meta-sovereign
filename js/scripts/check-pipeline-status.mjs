#!/usr/bin/env node
// The terminal gate runs even when a dependency failed or was cancelled.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pipelineFailures(needs) {
  if (!needs || Object.keys(needs).length === 0) {
    throw new Error('No job results supplied to the pipeline gate');
  }
  return Object.entries(needs)
    .filter(([, job]) => !['success', 'skipped'].includes(job.result))
    .map(([name, job]) => `${name}: ${job.result}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const failures = pipelineFailures(JSON.parse(process.env.NEEDS_JSON || '{}'));
  if (failures.length) {
    console.error(`Pipeline failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Every selected check passed; irrelevant jobs were skipped.');
  }
}
