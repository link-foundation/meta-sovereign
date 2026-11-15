import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { startupArguments } from '../src/cli/startup-configuration.js';
import { runCliCommand } from '../src/cli/command-runner.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test(
  'a FIFO configuration refuses without waiting for a writer',
  {
    timeout: 10000,
    skip:
      process.platform === 'win32' ||
      Boolean(process.versions.bun || process.versions.deno),
  },
  () => {
    const probe = fileURLToPath(
      new URL(
        '../../experiments/issue-56/startup-config-fifo.mjs',
        import.meta.url
      )
    );
    const output = execFileSync(process.execPath, [probe], {
      timeout: 6000,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=128' },
    });
    assert.deepEqual(JSON.parse(output.trim()), {
      fifoRefused: true,
      openedServer: false,
    });
  }
);

const fixture = async (run) => {
  const cwd = await mkdtemp(join(tmpdir(), 'startup-configuration-'));
  const globalDir = join(cwd, 'user-app');
  const localDir = join(cwd, 'local-app');
  await mkdir(globalDir);
  await mkdir(localDir);
  const put = (scope, server) =>
    writeFile(
      join(scope === 'global' ? globalDir : localDir, 'config.lino'),
      formatIndented({ id: 'configuration', obj: { server } })
    );
  try {
    await run({ cwd, globalDir, localDir, put });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

test(
  'global and local readable Lino values yield to explicit CLI without mutation',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', {
        port: 8787,
        verbose: true,
        backupKeep: 5,
        localUi: true,
      });
      await f.put('local', { port: 9000, verbose: false });
      const args = { _: [], port: '1234', 'local-ui': false };
      const answer = await startupArguments(args, f);
      assert.deepEqual(answer, {
        'backup-keep': 5,
        verbose: false,
        'local-ui': false,
        port: '1234',
        _: [],
      });
      assert.deepEqual(args, { _: [], port: '1234', 'local-ui': false });
    })
);

test(
  'missing implicit config is optional, selected local config is required',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      assert.deepEqual(await startupArguments({ _: [] }, f), { _: [] });
      await f.put('global', { port: 8787 });
      await writeFile(
        join(f.cwd, 'chosen.lino'),
        formatIndented({ id: 'configuration', obj: { server: { port: 9001 } } })
      );
      assert.equal(
        (await startupArguments({ 'app-config': 'chosen.lino' }, f)).port,
        9001
      );
      await assert.rejects(
        startupArguments({ 'app-config': 'missing.lino' }, f),
        { code: 'INVALID_APP_CONFIGURATION' }
      );
      await assert.rejects(startupArguments({ 'app-config': true }, f), {
        code: 'INVALID_APP_CONFIGURATION',
      });
      await rm(join(f.globalDir, 'config.lino'));
      await assert.rejects(
        startupArguments({ 'app-config': join(f.globalDir, 'config.lino') }, f),
        { code: 'INVALID_APP_CONFIGURATION' }
      );
    })
);

test(
  'malformed, oversized, unsupported and secret fields refuse without private diagnostics',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      for (const text of [
        'private invalid value',
        'x'.repeat(64 * 1024 + 1),
        formatIndented({
          id: 'configuration',
          obj: { server: { token: 'private_fixture' } },
        }),
        formatIndented({ id: 'configuration', obj: { server: { port: [] } } }),
        ...[
          { port: true },
          { port: 65536 },
          { port: -1 },
          { port: '8787' },
          { verbose: 'false' },
          { backupKeep: 1.5 },
          { backupKeep: 10001 },
          { backupIntervalHours: -1 },
          { backupIntervalHours: 597 },
          { recoveryFormats: 'json' },
          { uiUrl: 'https://fixture:private_fixture@example.invalid/' },
          { uiUrl: 'https://example.invalid/?token=private_fixture' },
          { allowOrigin: 'https://example.invalid/#private_fixture' },
          { allowOrigin: 'https://example.invalid/path' },
        ].map((server) =>
          formatIndented({ id: 'configuration', obj: { server } })
        ),
        formatIndented({
          id: 'configuration',
          obj: { password: 'private_fixture' },
        }),
      ]) {
        await writeFile(join(f.globalDir, 'config.lino'), text);
        await assert.rejects(startupArguments({}, f), (error) => {
          assert.equal(error.code, 'INVALID_APP_CONFIGURATION');
          assert.equal(
            error.message,
            'Invalid global application configuration.'
          );
          return true;
        });
      }
    })
);

test(
  'all documented server file fields retain their values',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('local', {
        port: 0,
        verbose: false,
        localUi: true,
        tls: false,
        jsonCompatibility: false,
        backupIntervalHours: 0.5,
        backupKeep: 0,
        recoveryFormats: 'text,binary',
        allowOrigin: 'https://example.invalid,capacitor://localhost',
        uiUrl: 'https://example.invalid/app/',
      });
      assert.deepEqual(await startupArguments({}, f), {
        port: 0,
        verbose: false,
        'local-ui': true,
        tls: false,
        'json-compatibility': false,
        'backup-interval-hours': 0.5,
        'backup-keep': 0,
        'recovery-formats': 'text,binary',
        'allow-origin': 'https://example.invalid,capacitor://localhost',
        'ui-url': 'https://example.invalid/app/',
      });
    })
);

test(
  'directory configs refuse and identical global/local paths are read consistently',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', { verbose: false });
      assert.equal(
        (await startupArguments({}, { ...f, localDir: f.globalDir })).verbose,
        false
      );
      await mkdir(join(f.localDir, 'config.lino'));
      await assert.rejects(startupArguments({}, f), {
        code: 'INVALID_APP_CONFIGURATION',
      });
    })
);

test(
  'serve dispatch receives layered values; help/version never read configuration',
  { timeout: 5000 },
  async () =>
    fixture(async (f) => {
      await f.put('global', { port: 9100, verbose: false });
      let seen;
      assert.equal(
        await runCliCommand(
          ['serve', '--store=synthetic-store'],
          (args) => {
            seen = args;
            return 0;
          },
          { configuration: f }
        ),
        0
      );
      assert.equal(seen.port, 9100);
      assert.equal(seen.verbose, false);
      await writeFile(
        join(f.globalDir, 'config.lino'),
        'private malformed configuration'
      );
      const messages = [];
      assert.equal(
        await runCliCommand(
          ['serve'],
          () => {
            throw Error('must not dispatch');
          },
          { configuration: f, log: (text) => messages.push(text) }
        ),
        1
      );
      assert.deepEqual(messages, ['Invalid global application configuration.']);
      for (const cmd of ['help', 'version']) {
        assert.equal(
          await runCliCommand([cmd], () => 0, { configuration: f }),
          0
        );
      }
    })
);
