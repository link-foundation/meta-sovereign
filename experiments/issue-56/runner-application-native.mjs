import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createRunnerApplicationPreparation,
  verifyRunnerApplication,
} from '../../js/src/server/runner-application.js';
import {
  createRunnerTransport,
  runRunnerCommand,
} from '../../js/src/server/runner-transport.js';
import { runnerApplicationFixture } from './runner-application-fixture.mjs';

const native = createRunnerTransport({ deadlineMs: 100000 });
const production = process.argv.includes('--production');
const sourceRoot = process.cwd();
const stageProduction = async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'runner application proof-')
  );
  const close = () => rm(directory, { recursive: true, force: true });
  try {
    await mkdir(path.join(directory, 'js'));
    const files = [
      'js/src',
      'js/bin',
      'package.json',
      'package-lock.json',
      'vendor/picomatch',
    ];
    for (const file of files) {
      await cp(path.join(sourceRoot, file), path.join(directory, file), {
        recursive: true,
      });
    }
    const lock = await readFile(path.join(directory, 'package-lock.json'));
    return {
      close,
      target: {
        cli: path.join(directory, 'js/bin/meta-sovereign.js'),
        directory,
        applicationLock: createHash('sha256').update(lock).digest('hex'),
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
};

const fixture = await (
  production ? stageProduction : runnerApplicationFixture
)();
const host =
  process.env.RUNNER_APPLICATION_SSH_HOST ?? process.env.RUNNER_GRAPH_SSH_HOST;
const image = process.env.RUNNER_APPLICATION_DOCKER_IMAGE_ID;
assert(!image || /^sha256:[a-f0-9]{64}$/u.test(image));
const target = {
  ...fixture.target,
  ...(host ? { host } : {}),
  ...(image ? { isolation: 'docker', image } : {}),
};
const runtime = { node: image ? 'node' : process.execPath };
const modules = path.join(target.directory, 'node_modules');
let installs = 0;
let installedPackages;
try {
  const prepare = createRunnerApplicationPreparation({
    install: async (...args) => {
      installs++;
      const result = await native(...args);
      if (result.code !== 0) {
        console.log(JSON.stringify(result));
      }
      return result;
    },
  });
  assert.equal(
    await verifyRunnerApplication(target, runtime, runRunnerCommand, {}),
    false
  );
  assert.equal(await prepare(target, runtime, runRunnerCommand, {}), true);
  const manifest = JSON.parse(
    await readFile(path.join(target.directory, 'package.json'))
  );
  const directPackages = Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  });
  for (const name of directPackages) {
    const dependency = JSON.parse(
      await readFile(path.join(modules, name, 'package.json'))
    );
    assert.equal(typeof dependency.version, 'string');
  }
  installedPackages = directPackages.length;
  const link = await readlink(modules);
  assert.equal(await prepare(target, runtime, runRunnerCommand, {}), true);
  assert.equal(await readlink(modules), link);
  assert.equal(installs, 1);
} finally {
  await fixture.close();
}
console.log(
  JSON.stringify({
    nativeNpm: true,
    actualSsh: Boolean(host),
    actualDocker: Boolean(image),
    production,
    installs,
    installedPackages,
    coldVerified: true,
    warmReused: true,
    resourcesClosed: true,
  })
);
