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
        if (step.uses?.includes('/.github/actions/npm-cache')) {
          const local = name === 'release.yml' && jobName === 'test';
          assert.equal(
            step.uses,
            `${local ? '.' : '$'}/.github/actions/npm-cache`
          );
          if (local) {
            const checkout = job.steps.findIndex((item) =>
              item.uses?.startsWith('actions/checkout@')
            );
            assert.ok(checkout >= 0 && checkout < job.steps.indexOf(step));
          }
          assert.doesNotThrow(() =>
            readFileSync(
              new URL(`../../${step.uses.slice(2)}/action.yml`, import.meta.url)
            )
          );
        }
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

test('cache reservations are isolated across workflows, refs and platforms', () => {
  const action = parse(
    readFileSync(
      new URL('../../.github/actions/npm-cache/action.yml', import.meta.url),
      'utf8'
    )
  );
  const restore = action.runs.steps.find((step) =>
    step.uses?.startsWith('actions/cache/restore@')
  );
  const writer = action.runs.steps.find((step) =>
    step.uses?.startsWith('actions/cache@')
  );
  assert.equal(action.inputs.write.default, 'false');
  assert.equal(restore.if, "inputs.write != 'true'");
  assert.equal(writer.if, "inputs.write == 'true'");
  assert.equal(restore.with.key, writer.with.key);
  for (const identity of [
    'github.workflow',
    'github.ref',
    'runner.os',
    'runner.arch',
    "hashFiles('package-lock.json')",
  ]) {
    assert.ok(writer.with.key.includes(identity), identity);
  }
});

test('the checkout-dependent cache exception remains scoped and documented', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8'
  );
  const exceptions = workflow
    .split('\n')
    .filter((line) => line.includes('ignore[self-repository]'));
  assert.equal(exceptions.length, 1);
  assert.match(exceptions[0], /uses: \.\/\.github\/actions\/npm-cache/);
  assert.match(exceptions[0], /already checked-out fresh merge/);
  assert.match(exceptions[0], /full evidence archive before checkout/);
});
