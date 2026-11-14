import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { partitionBrowserChecks } from '../scripts/browser-check-shards.mjs';

const source = (file) =>
  readFileSync(new URL(`../scripts/${file}`, import.meta.url));
const registry = JSON.parse(source('browser-checks.json'));

test('native application scenarios remain registered once in bounded groups', () => {
  const root = new URL('../../', import.meta.url);
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', root)));
  const scenarios = registry
    .filter((name) => name.startsWith('job-application'))
    .flatMap((name) => {
      const text = readFileSync(
        new URL(scripts[`test:e2e:${name}`].slice(5), root),
        'utf8'
      );
      const argumentsText = text.match(
        /runBrowserScenarios\([^[]+\[([^\]]+)\]/u
      )?.[1];
      assert.ok(argumentsText, name);
      const checks = argumentsText.match(/verify\w+/gu);
      assert.ok(
        checks.length <= 4,
        `${name} combines ${checks.length} native scenarios`
      );
      return checks;
    });
  assert.deepEqual(
    scenarios.sort(),
    [
      'verifyNativeApplication',
      'verifyNativeApplicationGuards',
      'verifyApplicationPanel',
      'verifyNativeApplicationRecovery',
      'verifyNativeApplicationDraft',
      'verifyNativeApplicationRunModes',
      'verifyNativeApplicationDeferral',
      'verifyNativeApplicationResume',
      'verifyNativeApplicationHolds',
      'verifyNativeApplicationRetries',
      'verifyNativeApplicationSupervised',
      'verifyNativeApplicationPopup',
      'verifyNativeApplicationLanguage',
      'verifyNativeApplicationLimits',
      'verifyNativeApplicationLimitWait',
      'verifyNativeApplicationLimitRestore',
      'verifyNativeHhCaptcha',
    ].sort()
  );
});

test('every registered browser check resolves to an existing direct Node entry', () => {
  const root = new URL('../../', import.meta.url);
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', root)));
  for (const name of registry) {
    const command =
      name === 'browser'
        ? 'node js/tests/e2e-browser-spa.mjs'
        : scripts[`test:e2e:${name}`];
    assert.match(command || '', /^node [\w./-]+\.mjs$/u, name);
    assert.ok(existsSync(new URL(command.slice(5), root)), name);
  }
});

test('both mandatory browser engines retain each registered check once within unchanged budgets', () => {
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs['e2e-browser'];
  assert.deepEqual(job.strategy.matrix.browser, ['chromium', 'webkit']);
  assert.deepEqual(job.strategy.matrix.shard, [1, 2, 3, 4]);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 35);
  assert.equal(job.env.E2E_SHARD, '${{ matrix.shard }}/4');
  assert.match(
    job.steps.find(({ name }) => name === 'Preserve browser diagnostics').with
      .name,
    /matrix.shard/u
  );
  assert.match(
    source('run-browser-checks.mjs').toString(),
    /timeout: 180_000/u
  );
  for (const browser of job.strategy.matrix.browser) {
    assert.ok(
      job.strategy.matrix.include.some(
        (entry) => entry.browser === browser && entry.runner
      )
    );
    const assigned = job.strategy.matrix.shard.flatMap((index) =>
      partitionBrowserChecks(registry, `${index}/4`)
    );
    assert.equal(new Set(assigned).size, registry.length);
    assert.deepEqual(assigned.sort(), [...registry].sort());
  }
  assert.deepEqual(partitionBrowserChecks(registry), registry);
});

test('invalid, duplicate and empty browser partitions refuse instead of omitting checks', () => {
  for (const shard of [
    '0/4',
    '5/4',
    '1/0',
    '1/999',
    ' 1/4',
    '1/4 ',
    '1',
    'NaN/4',
    '1/9007199254740992',
  ]) {
    assert.throws(() => partitionBrowserChecks(registry, shard), /E2E_SHARD/u);
  }
  for (const checks of [[], ['same', 'same'], ['bad check'], null]) {
    assert.throws(() => partitionBrowserChecks(checks), /unique registry/u);
  }
});

test('the actual browser runner executes disjoint checks and propagates a failed shard', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-browser-shards-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'js/scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'js/tests/helpers'), { recursive: true });
  for (const name of ['run-browser-checks.mjs', 'browser-check-shards.mjs']) {
    writeFileSync(path.join(dir, 'js/scripts', name), source(name));
  }
  writeFileSync(
    path.join(dir, 'js/tests/helpers/e2e-reduced-effects.mjs'),
    '// isolated fixture\n'
  );
  const names = ['first', 'second', 'third', 'fourth'];
  writeFileSync(
    path.join(dir, 'js/scripts/browser-checks.json'),
    JSON.stringify(names)
  );
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      scripts: Object.fromEntries(
        names.map((name) => [`test:e2e:${name}`, `node ${name}.mjs`])
      ),
    })
  );
  for (const name of names) {
    writeFileSync(
      path.join(dir, `${name}.mjs`),
      `console.log('executed:${name}'); if(process.env.MS_BROWSER_SHARD_FAILURE==='${name}') process.exitCode=1;\n`
    );
  }
  const invoke = (index, failure = '') => {
    const artifact = path.join(dir, `artifacts-${index}-${failure || 'pass'}`);
    const result = spawnSync('node', ['js/scripts/run-browser-checks.mjs'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=384',
        E2E_SHARD: `${index}/4`,
        E2E_ARTIFACT_DIR: artifact,
        MS_BROWSER_SHARD_FAILURE: failure,
      },
    });
    return {
      result,
      artifact,
      summary: JSON.parse(readFileSync(path.join(artifact, 'summary.json'))),
    };
  };
  for (const [position, name] of names.entries()) {
    const { result, artifact, summary } = invoke(position + 1);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(summary.checks, [name]);
    assert.equal(summary.totalChecks, 4);
    assert.equal(summary.shard, `${position + 1}/4`);
    assert.deepEqual(summary.failures, []);
    assert.match(result.stdout, new RegExp(`executed:${name}`, 'u'));
    assert.equal(
      names.filter((entry) => existsSync(path.join(artifact, `${entry}.log`)))
        .length,
      1
    );
  }
  const { result, summary } = invoke(2, 'second');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(summary.failures, ['second']);
});
