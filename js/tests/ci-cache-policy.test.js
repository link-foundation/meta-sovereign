import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

test('npm caching has explicit writers instead of implicit setup-node saves', () => {
  const directory = new URL('../../.github/workflows/', import.meta.url);
  for (const name of readdirSync(directory).filter((name) =>
    /\.yml$/.test(name)
  )) {
    const workflow = parse(readFileSync(new URL(name, directory), 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps || []) {
        if (step.uses?.startsWith('actions/setup-node@')) {
          assert.equal(
            step.with?.['package-manager-cache'],
            false,
            `${name}/${jobName}`
          );
          assert.equal(
            step.with?.cache,
            undefined,
            `${name}/${jobName}: use the shared cache action`
          );
        }
      }
    }
  }
});
