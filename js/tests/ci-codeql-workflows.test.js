import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const workflow = (name) =>
  parse(
    readFileSync(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
      'utf8'
    )
  );

test('every main CodeQL configuration also analyzes pull requests', () => {
  for (const name of ['release', 'security']) {
    const flow = workflow(name);
    assert.ok(Object.hasOwn(flow.on, 'pull_request'), `${name}: PR trigger`);
    if (flow.on.pull_request.branches) {
      assert.ok(flow.on.pull_request.branches.includes('main'));
    }
    assert.equal(flow.on.pull_request.paths, undefined);
    assert.equal(flow.on.pull_request['paths-ignore'], undefined);
    const job = flow.jobs.codeql;
    if (job.if) {
      const events = [
        ...job.if.matchAll(/github.event_name == '([^']+)'/g),
      ].map((match) => match[1]);
      assert.ok(
        events.includes('pull_request'),
        `${name}: documentation-only PRs still need the baseline configuration`
      );
      assert.ok(job.if.includes("!contains(needs.*.result, 'failure')"));
      assert.ok(job.if.includes("!contains(needs.*.result, 'cancelled')"));
    }
  }
});

test('both baseline configuration families retain all languages and the SARIF verdict', () => {
  for (const name of ['release', 'security']) {
    const job = workflow(name).jobs.codeql;
    assert.deepEqual(job.strategy.matrix.language.toSorted(), [
      'actions',
      'javascript-typescript',
      'python',
      'rust',
    ]);
    assert.ok(
      job.steps.some(
        (step) =>
          step.run ===
          'node js/scripts/check-codeql-results.mjs artifacts/codeql'
      )
    );
    assert.equal(
      job.steps.find((step) =>
        step.uses?.startsWith('github/codeql-action/init@')
      ).with['config-file'],
      './.github/codeql/codeql-config.yml'
    );
  }
});
