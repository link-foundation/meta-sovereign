import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createRunnerControl } from '../../js/src/server/runner-control.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';
import { verifyRunnerApplication } from '../../js/src/server/runner-application.js';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import {
  runnerGraphBackend,
  runnerGraphFixture,
} from './runner-graph-fixture.mjs';
import { runnerProfile } from './runner-fixture.mjs';

const host = process.env.RUNNER_GRAPH_SSH_HOST;
assert(host === 'runner-node-loopback');
const application = await runnerGraphFixture();
try {
  const profile = runnerProfile();
  const targets = validateRunnerProfile({
    ...profile,
    server: { ...profile.server, ...application.target, host },
  });
  const backend = runnerGraphBackend({
    execute: (target, args, options) =>
      runRunnerCommand({ ...target, host }, args, options),
  });
  const control = createRunnerControl({ targets, run: backend.run });
  assert.deepEqual(await control.act('start', 'server'), {
    ok: false,
    code: 'runner-application-dependencies-unavailable',
    states: { local: 'running', server: 'stopped' },
  });
  assert.ok(backend.calls.every(([, action]) => action === 'probe'));
  assert.equal(backend.graphChecks.length, 1);
  const target = {
    host,
    directory: process.cwd(),
    cli: join(process.cwd(), 'js/bin/meta-sovereign.js'),
  };
  assert(
    await verifyRunnerApplication(
      target,
      { node: process.execPath },
      runRunnerCommand,
      {}
    )
  );
} finally {
  await application.close();
}
console.log(
  JSON.stringify({
    nativeSsh: true,
    peerRetained: true,
    productionGraphLoaded: true,
    resourcesClosed: true,
  })
);
