import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerFixture, runnerProfile } from './runner-fixture.mjs';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';

const root = resolve(process.env.RUNNER_CLI_ROOT ?? '.');
const { runCli } = await import(
  pathToFileURL(join(root, 'js/src/cli/index.js'))
);
const dir = await mkdtemp(join(tmpdir(), 'runner-cli-admission-'));
try {
  const fixture = runnerFixture();
  const output = [];
  const code = await runCli(['runner', 'status'], {
    log: (line) => output.push(line),
    runner: {
      directory: () => dir,
      load: async () => validateRunnerProfile(runnerProfile()),
      run: fixture.run,
    },
  });
  assert.equal(code, 0, 'runner status was not admitted by the real CLI');
  assert.equal(
    fixture.calls.every(([, action]) => action === 'probe'),
    true
  );
  assert.match(output.join('\n'), /isolated-session/);
  assert.deepEqual(await readdir(dir), ['runner-control']);
  assert.deepEqual(await readdir(join(dir, 'runner-control')), []);
  console.log(
    JSON.stringify({
      runnerStatus: true,
      launched: false,
      openedApplicationStore: false,
    })
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
