import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runnerDeploymentFixture } from './runner-deployment-fixture.mjs';
import { runnerDeploymentPlan } from '../../js/src/server/runner-deployment.js';
import { createRunnerApplicationPreparation } from '../../js/src/server/runner-application.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';

const production = process.argv.includes('--production');
const host = process.env.RUNNER_SOURCE_SSH_HOST;
const mode = host ? 'server' : 'local';
const fixture = await runnerDeploymentFixture({ production, host });
try {
  const { target, prepareSource } = fixture;
  const plan = runnerDeploymentPlan(target, mode);
  assert.equal(plan.ok, true);
  assert.equal(fixture.downloads(), 0);
  const existing = path.join(fixture.parent, 'existing checkout');
  await mkdir(existing);
  await writeFile(path.join(existing, 'owner-file'), 'preserved');
  const existingTarget = { ...target, directory: existing };
  assert.deepEqual(
    await prepareSource(
      existingTarget,
      runnerDeploymentPlan(existingTarget, mode)
    ),
    {
      ok: false,
      code: 'runner-source-unconfirmed',
    }
  );
  assert.equal(
    await readFile(path.join(existing, 'owner-file'), 'utf8'),
    'preserved'
  );
  assert.equal(fixture.downloads(), 0);
  await assert.rejects(lstat(target.directory), { code: 'ENOENT' });
  fixture.substitute('unexpected bytes');
  assert.deepEqual(await prepareSource(target, plan), {
    ok: false,
    code: 'runner-source-unconfirmed',
  });
  await assert.rejects(lstat(target.directory), { code: 'ENOENT' });
  fixture.substitute(null);
  assert.equal((await prepareSource(target, plan)).state, 'prepared');
  assert.equal((await prepareSource(target, plan)).state, 'present');
  assert.equal(fixture.downloads(), 2);
  const manifest = JSON.parse(
    await readFile(path.join(target.directory, 'package.json'))
  );
  assert.equal(`v${manifest.version}`, plan.release);
  const prepare = createRunnerApplicationPreparation();
  assert.equal(
    await prepare(target, { node: target.node }, runRunnerCommand, {}),
    true
  );
} finally {
  await fixture.close();
}
console.log(
  JSON.stringify({
    production,
    actualSsh: Boolean(host),
    requests: fixture.downloads(),
    tamperRefused: true,
    ownerDirectoryPreserved: true,
    sourcePrepared: true,
    warmReused: true,
    productionGraphLoaded: true,
    resourcesClosed: true,
  })
);
