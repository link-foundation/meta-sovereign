import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const flow = parse(
  readFileSync(
    new URL('../../.github/workflows/pages.yml', import.meta.url),
    'utf8'
  )
);
const deployment = flow.jobs.deploy.steps.find(({ uses }) =>
  uses?.startsWith('actions/deploy-pages@')
);

test('known upstream DEP0040 workaround is limited to the Pages deploy action', () => {
  assert.equal(deployment.env?.NODE_OPTIONS, '--disable-warning=DEP0040');
  assert.equal(flow.env?.NODE_OPTIONS, undefined);
  for (const job of Object.values(flow.jobs)) {
    assert.equal(job.env?.NODE_OPTIONS, undefined);
    for (const step of job.steps) {
      if (step !== deployment) {
        assert.equal(step.env?.NODE_OPTIONS, undefined);
      }
      assert.equal(step.env?.NODE_NO_WARNINGS, undefined);
    }
  }
});

test('the Pages workaround retains unrelated Node and deprecation warnings', () => {
  const result = spawnSync(
    'node',
    [
      '-e',
      `
    process.emitWarning('known upstream punycode', { code: 'DEP0040', type: 'DeprecationWarning' });
    process.emitWarning('unsafe shell', { code: 'DEP0190', type: 'DeprecationWarning' });
    process.emitWarning('unexpected warning', { code: 'ISSUE_52_PROBE' });
  `,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: deployment.env?.NODE_OPTIONS || '' },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /DEP0040/);
  assert.match(result.stderr, /DEP0190/);
  assert.match(result.stderr, /ISSUE_52_PROBE/);
});
