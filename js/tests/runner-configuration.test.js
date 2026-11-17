import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { readRunnerConfiguration } from '../src/cli/runner-configuration.js';
import { createRunnerController } from '../src/server/runner-controller.js';
import { runCli } from '../src/cli/index.js';
import { runnerApiFixture } from '../../experiments/issue-56/runner-api-fixture.mjs';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import {
  runnerFixture,
  runnerProfile,
} from '../../experiments/issue-56/runner-fixture.mjs';

const documentFor = (value) => formatIndented({ id: 'runner', obj: value });
const temporary = async (work) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-configuration-'));
  const global = join(dir, 'global');
  const local = join(dir, 'local');
  await mkdir(global);
  await mkdir(local);
  const globalFile = join(global, 'runner.lino');
  const localFile = join(local, 'runner.lino');
  const backend = runnerFixture();
  const options = {
    directory: () => global,
    localDirectory: () => local,
    run: backend.run,
  };
  const controller = createRunnerController(options);
  try {
    await work({ dir, globalFile, localFile, backend, options, controller });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
const setup = async ({ globalFile, localFile }) => {
  await writeFile(globalFile, documentFor(runnerProfile()));
  await writeFile(
    localFile,
    documentFor({
      local: { port: 8128 },
      server: { host: 'local@example.invalid' },
    })
  );
};
const observedProfile = async (controller) =>
  parseIndented({
    text: (await controller.execute({ action: 'profile' })).document,
  }).obj;

test(
  'shared profile reads merge app-folder fields over global fields without probes or writes',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const { controller, backend, globalFile, localFile } = fixture;
      const before = await Promise.all([
        readFile(globalFile),
        readFile(localFile),
      ]);
      const value = await observedProfile(controller);
      assert.equal(value.local.port, 8128);
      assert.equal(value.local.directory, runnerProfile().local.directory);
      assert.equal(value.server.host, 'local@example.invalid');
      assert.equal(value.server.port, 8124);
      assert.equal(value.session, 'meta-sovereign-test');
      assert.deepEqual(backend.calls, []);
      assert.deepEqual(
        await Promise.all([readFile(globalFile), readFile(localFile)]),
        before
      );
    })
);

test(
  'a local-only complete profile is usable and an absent profile remains unconfigured',
  { timeout: 5000 },
  () =>
    temporary(async ({ controller, localFile, backend }) => {
      assert.deepEqual(
        (await controller.execute({ action: 'status' })).states,
        { local: 'unconfigured', server: 'unconfigured' }
      );
      await writeFile(localFile, documentFor(runnerProfile()));
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).ok,
        true
      );
      assert.equal(backend.state.local, 'running');
    })
);

test(
  'the explicit selected profile replaces implicit layers and a selected missing file refuses',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const selected = join(fixture.dir, 'selected.lino');
      const profile = runnerProfile();
      profile.local.port = 8130;
      await writeFile(selected, documentFor(profile));
      assert.equal(
        parseIndented({
          text: (
            await fixture.controller.execute({
              action: 'profile',
              profile: selected,
            })
          ).document,
        }).obj.local.port,
        8130
      );
      await assert.rejects(
        fixture.controller.execute({
          action: 'profile',
          profile: `${selected}-PRIVATE`,
        }),
        /Runner profile unavailable or invalid\./
      );
      assert.deepEqual(fixture.backend.calls, []);
    })
);

test(
  'revision-checked edits acknowledge the effective local file and preserve the global source',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const { controller, globalFile, localFile, backend } = fixture;
      const globalBefore = await readFile(globalFile);
      const before = await controller.execute({ action: 'profile' });
      const value = parseIndented({ text: before.document }).obj;
      value.server.port = 8131;
      const saved = await controller.execute({
        action: 'configure',
        document: documentFor(value),
        revision: before.revision,
      });
      assert.deepEqual(await controller.execute({ action: 'profile' }), saved);
      assert.equal((await observedProfile(controller)).local.port, 8128);
      assert.equal(
        parseIndented({ text: await readFile(localFile, 'utf8') }).obj.server
          .port,
        8131
      );
      assert.deepEqual(await readFile(globalFile), globalBefore);
      assert.deepEqual(backend.calls, []);
      if (process.platform !== 'win32') {
        assert.equal((await stat(localFile)).mode & 0o777, 0o600);
      }
    })
);

test(
  'a visible global edit conflicts with an old effective revision and leaves both layers intact',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const before = await fixture.controller.execute({ action: 'profile' });
      const profile = runnerProfile();
      profile.server.port = 8132;
      await writeFile(fixture.globalFile, documentFor(profile));
      const localBefore = await readFile(fixture.localFile);
      assert.deepEqual(
        await fixture.controller.execute({
          action: 'configure',
          document: before.document,
          revision: before.revision,
        }),
        { ok: false, code: 'runner-profile-conflict' }
      );
      assert.deepEqual(await readFile(fixture.localFile), localBefore);
    })
);

test(
  'reviewed removal of an inherited target survives reload without changing the global source',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const globalBefore = await readFile(fixture.globalFile);
      const before = await fixture.controller.execute({ action: 'profile' });
      const value = parseIndented({ text: before.document }).obj;
      delete value.server;
      const saved = await fixture.controller.execute({
        action: 'configure',
        document: documentFor(value),
        revision: before.revision,
      });
      assert.deepEqual(
        await fixture.controller.execute({ action: 'profile' }),
        saved
      );
      assert.equal(
        (await fixture.controller.execute({ action: 'status' })).states.server,
        'unconfigured'
      );
      assert.deepEqual(await readFile(fixture.globalFile), globalBefore);
      assert.equal(
        parseIndented({ text: await readFile(fixture.localFile, 'utf8') }).obj
          .server,
        false
      );
    })
);

test(
  'a newly created local layer invalidates a prior global-only revision',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await writeFile(fixture.globalFile, documentFor(runnerProfile()));
      const before = await fixture.controller.execute({ action: 'profile' });
      await writeFile(
        fixture.localFile,
        documentFor({ local: { port: 8133 } })
      );
      assert.equal(
        (
          await fixture.controller.execute({
            action: 'configure',
            document: before.document,
            revision: before.revision,
          })
        ).code,
        'runner-profile-conflict'
      );
      assert.equal(
        (await observedProfile(fixture.controller)).local.port,
        8133
      );
    })
);

test(
  'local target edits cannot redirect Stop or hide a running retained address',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      assert.equal(
        (await fixture.controller.execute({ action: 'start', mode: 'server' }))
          .ok,
        true
      );
      await writeFile(
        fixture.localFile,
        documentFor({ server: { host: 'new@example.invalid' } })
      );
      assert.equal(
        (await fixture.controller.execute({ action: 'start', mode: 'local' }))
          .code,
        'runner-profile-change-blocked'
      );
      fixture.backend.targets.length = 0;
      assert.equal(
        (await fixture.controller.execute({ action: 'stop', mode: 'server' }))
          .ok,
        true
      );
      assert.ok(
        fixture.backend.targets
          .filter((target) => target.host)
          .every((target) => target.host === 'local@example.invalid')
      );
      assert.equal(
        (await fixture.controller.execute({ action: 'start', mode: 'server' }))
          .ok,
        true
      );
      assert.equal(fixture.backend.targets.at(-1).host, 'new@example.invalid');
    })
);

test(
  'malformed, oversized, credential-shaped and nonregular local layers refuse without revealing values',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await writeFile(fixture.globalFile, documentFor(runnerProfile()));
      for (const input of [
        'PRIVATE malformed',
        '界'.repeat(21846),
        documentFor({ server: { password: 'PRIVATE' } }),
        documentFor({ local: { port: 0 } }),
        documentFor({ server: { host: 'user:PRIVATE@example.invalid' } }),
        documentFor({ session: null }),
        documentFor({ local: { directory: 'PRIVATE-relative' } }),
      ]) {
        await writeFile(fixture.localFile, input);
        await assert.rejects(fixture.controller.execute({ action: 'status' }), {
          message: 'Runner profile unavailable or invalid.',
        });
      }
      await rm(fixture.localFile);
      await mkdir(fixture.localFile);
      await assert.rejects(fixture.controller.execute({ action: 'status' }), {
        message: 'Runner profile unavailable or invalid.',
      });
      assert.deepEqual(fixture.backend.calls, []);
    })
);

test(
  'an invalid hidden global field still refuses and missing inherited required fields never acquire defaults',
  { timeout: 5000 },
  () =>
    temporary(async ({ globalFile, localFile }) => {
      const value = runnerProfile();
      value.local.port = 0;
      await writeFile(globalFile, documentFor(value));
      await writeFile(localFile, documentFor({ local: { port: 8128 } }));
      await assert.rejects(
        readRunnerConfiguration(globalFile, { localFile }),
        /Runner profile unavailable or invalid\./
      );
      await writeFile(globalFile, documentFor({}));
      await assert.rejects(
        readRunnerConfiguration(globalFile, { localFile }),
        /Runner profile unavailable or invalid\./
      );
    })
);

test(
  'actual CLI overrides local fields ephemerally and preserves both files and process environment',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      const before = await Promise.all([
        readFile(fixture.globalFile),
        readFile(fixture.localFile),
      ]);
      const environment = { ...process.env };
      assert.equal(
        await runCli(
          [
            'runner',
            'start',
            'local',
            '--local-port=8140',
            '--local-node=node-custom',
          ],
          { runner: fixture.options, log: () => {} }
        ),
        0
      );
      assert.ok(
        fixture.backend.targets.some(
          (target) => target.port === 8140 && target.node === 'node-custom'
        )
      );
      assert.deepEqual(
        await Promise.all([
          readFile(fixture.globalFile),
          readFile(fixture.localFile),
        ]),
        before
      );
      assert.ok(
        Object.keys(process.env).length === Object.keys(environment).length &&
          Object.entries(environment).every(
            ([key, value]) => process.env[key] === value
          ),
        'CLI leaves process environment unchanged'
      );
      assert.equal(
        (await observedProfile(fixture.controller)).local.port,
        8128
      );
      fixture.backend.targets.length = 0;
      assert.equal(
        (await fixture.controller.execute({ action: 'stop', mode: 'local' }))
          .ok,
        true
      );
      assert.ok(
        fixture.backend.targets
          .filter((target) => !target.host)
          .every((target) => target.port === 8140)
      );
    })
);

test(
  'actual CLI rejects malformed overrides, remote file edits and credentials before effects',
  { timeout: 5000 },
  () =>
    temporary(async (fixture) => {
      await setup(fixture);
      for (const flags of [
        ['--local-port'],
        ['--local-port=0'],
        ['--local-port=8123x'],
        ['--local-port=1e3'],
        ['--server-host=user:PRIVATE@example.invalid'],
        ['--local-directory=PRIVATE-relative'],
        ['--local-token=PRIVATE'],
        ['--session=PRIVATE bad'],
        ['--url=http://127.0.0.1:1', '--local-port=8140'],
      ]) {
        const output = [];
        assert.equal(
          await runCli(['runner', 'status', ...flags], {
            runner: fixture.options,
            log: (line) => output.push(line),
          }),
          1
        );
        assert.doesNotMatch(output.join('\n'), /PRIVATE/);
      }
      assert.deepEqual(fixture.backend.calls, []);
    })
);

test(
  'both actual Lino transports read and acknowledge the same local overlay without process mutations',
  { timeout: 10000 },
  async () => {
    const fixture = await runnerApiFixture({
      overlay: { local: { port: 8128 } },
    });
    try {
      const globalBefore = await readFile(join(fixture.dir, 'runner.lino'));
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const before = await readWireResponse(
          await fetch(`${fixture.base}/api/runner/profile`, {
            headers: { accept: type },
          })
        );
        const value = parseIndented({ text: before.document }).obj;
        assert.equal(value.local.port, index === 0 ? 8128 : 8141);
        value.local.port = 8141 + index;
        const response = await fetch(`${fixture.base}/api/runner/configure`, {
          method: 'POST',
          headers: { 'content-type': type, accept: type },
          body: encodeWire(
            { revision: before.revision, document: documentFor(value) },
            type
          ),
        });
        assert.equal(response.status, 200);
        const saved = await readWireResponse(response);
        assert.equal(
          parseIndented({ text: saved.document }).obj.local.port,
          value.local.port
        );
        assert.deepEqual(
          await readFile(join(fixture.dir, 'runner.lino')),
          globalBefore
        );
        assert.equal(
          parseIndented({
            text: await readFile(join(fixture.localDir, 'runner.lino'), 'utf8'),
          }).obj.local.port,
          value.local.port
        );
      }
      assert.deepEqual(fixture.backend.calls, []);
    } finally {
      await fixture.close();
    }
  }
);
