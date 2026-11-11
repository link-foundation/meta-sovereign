import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('native focus uses full Chromium while other groups and executable overrides retain their launch', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-native-focus-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const helper = readFileSync(
    new URL('./helpers/e2e-browser-scenarios.mjs', import.meta.url),
    'utf8'
  );
  writeFileSync(
    path.join(dir, 'runner.mjs'),
    helper.replace("'./e2e-chat.mjs'", "'./browser-stub.mjs'")
  );
  writeFileSync(
    path.join(dir, 'browser-stub.mjs'),
    `
export const browserOf = async () => ({
  engine: process.env.FIXTURE_ENGINE,
  browserType: {
    executablePath: () => '/fixture/full-chromium',
    launch: async (options) => {
      console.log(JSON.stringify({ launch: options }));
      return { close: async () => console.log('fixture-browser-closed') };
    },
  },
});
`
  );
  const runner = pathToFileURL(path.join(dir, 'runner.mjs')).href;
  const invoke = ({
    engine = 'chromium',
    nativeFocus = false,
    executable = '',
    fail = false,
  } = {}) => {
    const env = {
      ...process.env,
      FIXTURE_ENGINE: engine,
      E2E_EXECUTABLE_PATH: executable,
    };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      'node',
      [
        '--input-type=module',
        '--eval',
        `
import { runBrowserScenarios } from ${JSON.stringify(runner)};
await runBrowserScenarios('fixture', [async function check() {
  if (${fail}) throw new Error('fixture scenario failed');
}], { nativeFocus: ${nativeFocus} });
`,
      ],
      { encoding: 'utf8', env }
    );
    const launch = JSON.parse(
      result.stdout.split('\n').find((line) => line.startsWith('{'))
    ).launch;
    assert.equal(launch.headless, true);
    assert.match(result.stdout, /fixture-browser-closed/);
    return { ...result, launch };
  };
  for (const options of [
    { nativeFocus: true },
    {},
    { engine: 'webkit', nativeFocus: true },
    { nativeFocus: true, executable: '/fixture/owner-browser' },
  ]) {
    const result = invoke(options);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.launch.executablePath,
      options.executable ||
        (options.nativeFocus && options.engine !== 'webkit'
          ? '/fixture/full-chromium'
          : undefined)
    );
  }
  const failed = invoke({ nativeFocus: true, fail: true });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /fixture scenario failed/);
  const entry = readFileSync(
    new URL('./e2e-question-inactive-history-browser.mjs', import.meta.url),
    'utf8'
  );
  assert.match(entry, /nativeFocus:\s*true/u);
});
