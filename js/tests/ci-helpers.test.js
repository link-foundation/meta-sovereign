import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNamedExport,
  loadCommandStream,
} from '../scripts/use-module.mjs';
import { pipelineFailures } from '../scripts/check-pipeline-status.mjs';
import { npmVersionState } from '../scripts/registry-state.mjs';
import { waitForServer } from './helpers/pack-process.mjs';

test('release dependencies normalize ESM and nested CommonJS and reject unsupported shapes', async () => {
  const value = {
    $: () => {},
    shell: { errexit: (value) => assert.equal(value, true) },
  };
  for (const shape of [
    value,
    { default: value },
    { 'module.exports': value },
    { default: { default: value } },
  ]) {
    assert.equal(resolveNamedExport(shape, '$', 'fixture'), value);
  }
  assert.throws(
    () => resolveNamedExport({ default: {} }, '$', 'fixture'),
    /callable/
  );
  assert.equal(await loadCommandStream(async () => value), value);
});

test('pipeline gate rejects failed, cancelled and missing results', () => {
  for (const result of ['failure', 'cancelled', undefined]) {
    assert.deepEqual(pipelineFailures({ build: { result } }), [
      `build: ${result}`,
    ]);
  }
  assert.deepEqual(
    pipelineFailures({
      build: { result: 'success' },
      docs: { result: 'skipped' },
    }),
    []
  );
  assert.throws(() => pipelineFailures({}), /No job results/);
});

test('registry probe distinguishes unpublished versions from authentication and network failures', () => {
  assert.equal(
    npmVersionState({ status: 0, stdout: '"1.2.3"' }, '1.2.3'),
    'published'
  );
  assert.equal(
    npmVersionState(
      { status: 1, stdout: '{"error":{"code":"E404"}}' },
      '1.2.3'
    ),
    'missing'
  );
  for (const code of ['E401', 'E403', 'ETIMEDOUT', 'ENOTFOUND']) {
    assert.throws(
      () =>
        npmVersionState(
          { status: 1, stdout: JSON.stringify({ error: { code } }) },
          '1.2.3'
        ),
      /Registry probe failed/
    );
  }
  assert.throws(
    () => npmVersionState({ status: 0, stdout: '"1.2.30"' }, '1.2.3'),
    /Unexpected registry/
  );
});

test('package startup fails promptly on child exit and hung health request', async () => {
  await waitForServer(
    'http://fixture',
    { exitCode: null },
    {
      headers: { origin: 'https://hosted.example' },
      request: async (_url, options) => {
        assert.equal(options.headers.origin, 'https://hosted.example');
        return { ok: true };
      },
    }
  );
  await assert.rejects(
    waitForServer('http://fixture', { exitCode: 9 }),
    /exited with 9/
  );
  const start = Date.now();
  await assert.rejects(
    waitForServer(
      'http://fixture',
      { exitCode: null },
      {
        deadlineMs: 40,
        intervalMs: 1,
        request: (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('aborted')))
          ),
      }
    ),
    /no answer/
  );
  assert.ok(Date.now() - start < 1000);
});

test('release metadata guard allows only version changes, never dependency edits', async () => {
  const { releaseMetadataPath, withoutReleaseVersion } =
    await import('../scripts/validated-release-tree.mjs');
  assert.ok(releaseMetadataPath('.changeset/fix.md'));
  assert.equal(releaseMetadataPath('js/src/server/index.js'), false);
  assert.equal(
    withoutReleaseVersion(
      'package.json',
      '{"version":"1","dependencies":{"x":"2"}}'
    ),
    withoutReleaseVersion(
      'package.json',
      '{"version":"2","dependencies":{"x":"2"}}'
    )
  );
  assert.notEqual(
    withoutReleaseVersion(
      'package.json',
      '{"version":"1","dependencies":{"x":"2"}}'
    ),
    withoutReleaseVersion(
      'package.json',
      '{"version":"2","dependencies":{"x":"3"}}'
    )
  );
});

test('OIDC preflight verifies the actual package exchange and rejects unknown or refused responses', async () => {
  const { preflightNpm } = await import('../scripts/preflight-release.mjs');
  const env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.invalid/token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture',
    PACKAGE_NAME: 'fixture',
  };
  const request = async (url) =>
    String(url).includes('fixture.invalid')
      ? { ok: true, json: async () => ({ value: 'fixture-jwt' }) }
      : { ok: true, json: async () => ({ token: 'fixture-npm' }) };
  assert.match(await preflightNpm(env, request), /verified/);
  await assert.rejects(preflightNpm({}, request), /grant id-token/);
  await assert.rejects(
    preflightNpm(env, async () => ({ ok: false, status: 429 })),
    /unknown/
  );
});

test('installed release shell rejects nonzero command exits', async () => {
  const { $ } = await loadCommandStream();
  const mode = globalThis.Deno ? 'eval' : '-e';
  const source = 'globalThis.Deno ? Deno.exit(7) : process.exit(7)';
  await assert.rejects(
    $`${process.execPath} ${mode} ${source}`.run({ capture: true }),
    (error) => error.code === 7
  );
});

test('GitHub release probes distinguish absence from unknown failures', async () => {
  const { probeGitHubRelease } =
    await import('../scripts/github-release-state.mjs');
  const probe = (response) =>
    probeGitHubRelease('owner/repo', 'v1.0.0', {
      request: async () => response,
    });
  assert.equal(await probe({ status: 404 }), null);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(probe({ status }), /state is unknown/);
  }
  await assert.rejects(
    probe({ ok: true, json: async () => ({}) }),
    /malformed/
  );
  const release = { id: 1, tag_name: 'v1.0.0', assets: [] };
  assert.deepEqual(
    await probe({ ok: true, json: async () => release }),
    release
  );
});

test('dependency graph preflight permits PR capability notices but fails main and unknown errors', async () => {
  const { checkDependencyGraph } =
    await import('../scripts/dependency-graph.mjs');
  const env = { GITHUB_REPOSITORY: 'owner/repo', BASE_SHA: 'a', HEAD_SHA: 'b' };
  const request = async () => ({ status: 403, ok: false });
  const notices = [];
  assert.equal(
    await checkDependencyGraph(env, request, (message) =>
      notices.push(message)
    ),
    false
  );
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^::notice::.*owner\/repo\/settings/);
  await assert.rejects(
    checkDependencyGraph({ ...env, REQUIRE_GRAPH: '1' }, request),
    /administrator/
  );
  await assert.rejects(
    checkDependencyGraph(env, async () => ({ status: 500 })),
    /unknown/
  );
  assert.equal(
    await checkDependencyGraph(env, async () => ({ ok: true })),
    true
  );
});

test('publish retries classify actual npm output, refusing authentication and unknown failures', async () => {
  const { publishFailureKind } = await import('../scripts/publish-policy.mjs');
  for (const output of [
    'npm error code E404',
    'npm error 403 Forbidden',
    'npm error code ENEEDAUTH',
    'Repository rule violations found',
    'Resource not accessible by integration',
  ]) {
    assert.equal(publishFailureKind(output), 'permanent');
  }
  for (const output of [
    'npm error code ECONNRESET',
    'npm error 503 Service unavailable',
    'HTTP 429',
  ]) {
    assert.equal(publishFailureKind(output), 'transient');
  }
  assert.equal(
    publishFailureKind('cannot publish over previously staged version'),
    'staged'
  );
  assert.equal(publishFailureKind('exit 1'), 'unknown');
});
