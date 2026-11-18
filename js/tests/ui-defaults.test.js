import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { formatIndented } from 'lino-objects-codec';
import { startupArguments } from '../src/cli/startup-configuration.js';
import { serveOptions } from '../src/cli/server-options.js';
import { runCliCommand } from '../src/cli/command-runner.js';
import { desktopConfiguration } from '../electron/configuration.js';
import { validateUiDefaults } from '../src/configuration/ui-defaults.js';
import {
  currentUiDefaults,
  receiveUiDefaults,
  followUiDefaults,
} from '../src/web/ui-defaults.js';
import * as appearance from '../src/web/appearance.js';
const {
  readAppearance,
  setSkin,
  currentMode,
  resetAppearance,
  THEME_KEY,
  SKIN_KEY,
} = appearance;
import { detectInitialLocale } from '../src/web/i18n.js';
import { diagnosticServer } from '../../experiments/issue-56/diagnostics-fixture.mjs';
import {
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const fixture = async (work) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ui-defaults-'));
  const config = {
    cwd,
    globalDir: join(cwd, 'global'),
    localDir: join(cwd, 'local'),
  };
  await mkdir(config.globalDir);
  await mkdir(config.localDir);
  const files = ['globalDir', 'localDir'].map((key) =>
    join(config[key], 'config.lino')
  );
  const put = (index, server) =>
    writeFile(files[index], formatIndented({ id: 'config', obj: { server } }));
  try {
    await work({ config, files, put });
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
};

test(
  'desktop and serve share partial global/local presentation defaults and ephemeral CLI precedence',
  { timeout: 5000 },
  () =>
    fixture(async ({ config, files, put }) => {
      await put(0, { theme: 'dark', skin: 'telegram', language: 'ru' });
      await put(1, { theme: 'auto', language: 'en' });
      const before = await Promise.all(files.map((file) => readFile(file)));
      assert.deepEqual(
        serveOptions(await startupArguments({}, config)).uiDefaults,
        { theme: 'auto', skin: 'telegram', language: 'en' }
      );
      const argv = ['--theme=light', '--skin=signal', '--language=hi'];
      assert.deepEqual((await desktopConfiguration(argv, config)).uiDefaults, {
        theme: 'light',
        skin: 'signal',
        language: 'hi',
      });
      let receipt;
      assert.equal(
        await runCliCommand(
          [
            'serve',
            '--theme=system',
            '--language=zh',
            '--store=unused-fixture',
          ],
          async (args) => {
            receipt = serveOptions(args).uiDefaults;
            return 0;
          },
          { configuration: config }
        ),
        0
      );
      assert.deepEqual(receipt, {
        theme: 'system',
        skin: 'telegram',
        language: 'zh',
      });
      assert.deepEqual(
        await Promise.all(files.map((file) => readFile(file))),
        before
      );
      assert.deepEqual(argv, [
        '--theme=light',
        '--skin=signal',
        '--language=hi',
      ]);
    })
);

test(
  'invalid file and explicit presentation values refuse without disclosing them or opening a runtime',
  { timeout: 5000 },
  () =>
    fixture(async ({ config, put }) => {
      const secret = 'PRIVATE-interface-value';
      await put(0, { theme: secret });
      await put(1, { theme: 'dark' });
      await assert.rejects(startupArguments({ theme: 'light' }, config), {
        message: 'Invalid global application configuration.',
      });
      await put(0, {});
      let opened = false;
      for (const key of ['theme', 'skin', 'language']) {
        const output = [];
        assert.equal(
          await runCliCommand(
            ['serve', `--${key}=${secret}`, '--store=unused-fixture'],
            async () => {
              opened = true;
            },
            { configuration: config, log: (line) => output.push(line) }
          ),
          1
        );
        assert.deepEqual(output, [
          'Invalid interface application configuration.',
        ]);
        assert.throws(() => serveOptions({ [key]: secret }), {
          code: 'INVALID_UI_DEFAULTS',
        });
      }
      assert.equal(opened, false);
      assert.throws(
        () => validateUiDefaults({ language: 'ru', token: secret }),
        { message: 'Invalid interface defaults.' }
      );
    })
);

test(
  'text and binary Lino expose only validated read-only defaults',
  { timeout: 10000 },
  async () => {
    const uiDefaults = { theme: 'auto', skin: 'signal', language: 'ru' };
    const server = await diagnosticServer({ uiDefaults });
    try {
      uiDefaults.language = 'hi';
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${server.base}/api/ui/defaults`, {
          headers: { accept: type },
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type').split(';')[0], type);
        assert.deepEqual(await readWireResponse(response), {
          theme: 'auto',
          skin: 'signal',
          language: 'ru',
        });
      }
      assert.equal(
        (await fetch(`${server.base}/api/ui/defaults`, { method: 'POST' })).ok,
        false
      );
      assert.deepEqual(
        await readWireResponse(await fetch(`${server.base}/api/ui/defaults`)),
        { theme: 'auto', skin: 'signal', language: 'ru' }
      );
    } finally {
      await server.close();
    }
    await assert.rejects(
      diagnosticServer({ uiDefaults: { password: 'PRIVATE' } }),
      { code: 'INVALID_UI_DEFAULTS' }
    );
  }
);

test('browser defaults yield to explicit choices and language reset follows configured or navigator fallback', () => {
  const defaults = { theme: 'dark', skin: 'signal', language: 'ru' };
  assert.deepEqual(
    readAppearance(() => null, defaults),
    { mode: 'dark', skin: 'signal' }
  );
  assert.deepEqual(
    readAppearance(
      (key) => (key === THEME_KEY ? 'light' : 'telegram'),
      defaults
    ),
    { mode: 'light', skin: 'telegram' }
  );
  const env = { navigator: { languages: ['en-US'] }, storage: null, defaults };
  assert.equal(detectInitialLocale(env), 'ru');
  assert.equal(
    detectInitialLocale({ ...env, storage: { getItem: () => 'hi' } }),
    'hi'
  );
  assert.equal(
    detectInitialLocale({ ...env, defaults: { language: 'system' } }),
    'en'
  );
});

test('choosing a skin does not persist an inherited theme and explicit reset follows fresh defaults', () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  );
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  try {
    receiveUiDefaults({ theme: 'dark', skin: 'signal' });
    resetAppearance();
    setSkin('telegram');
    assert.equal(values.has(THEME_KEY), false);
    assert.equal(values.get(SKIN_KEY), 'telegram');
    receiveUiDefaults({ theme: 'light', skin: 'whatsapp' });
    assert.equal(currentMode(), 'light');
    assert.equal(readAppearance().skin, 'telegram');
    resetAppearance();
    assert.deepEqual(readAppearance(), { mode: 'light', skin: 'whatsapp' });
    assert.equal(values.size, 0);
    assert.equal(receiveUiDefaults({ theme: 'PRIVATE' }), false);
    assert.deepEqual(currentUiDefaults(), { theme: 'light', skin: 'whatsapp' });
  } finally {
    receiveUiDefaults({});
    resetAppearance();
    if (descriptor) {
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    } else {
      delete globalThis.localStorage;
    }
  }
});

test(
  'connection changes ignore superseded defaults and disposal aborts reads and late subscriptions',
  { timeout: 5000 },
  async () => {
    let event;
    let releaseSubscription;
    let removed = 0;
    const reads = [];
    const api = {
      isOnline: async () => true,
      on: (listener) => {
        event = listener;
        return new Promise((resolve) => {
          releaseSubscription = resolve;
        });
      },
      uiDefaults: ({ signal }) =>
        new Promise((resolve) => reads.push({ signal, resolve })),
    };
    const close = followUiDefaults(api);
    try {
      await setImmediate();
      event({ type: 'mode-change', online: true });
      assert.equal(reads[0].signal.aborted, true);
      reads[1].resolve({ theme: 'dark' });
      await setImmediate();
      reads[0].resolve({ theme: 'light' });
      await setImmediate();
      assert.deepEqual(currentUiDefaults(), { theme: 'dark' });
      event({ type: 'mode-change', online: true });
      event({ type: 'mode-change', online: false });
      assert.equal(reads[2].signal.aborted, true);
      reads[2].resolve({ theme: 'light' });
      await setImmediate();
      event({ type: 'mode-change', online: true });
      close();
      reads[3].resolve({ theme: 'light' });
      releaseSubscription(() => removed++);
      await setImmediate();
      assert.equal(reads[3].signal.aborted, true);
      assert.equal(removed, 1);
      assert.deepEqual(currentUiDefaults(), { theme: 'dark' });
      event({ type: 'mode-change', online: true });
      assert.equal(reads.length, 4);
    } finally {
      close();
      receiveUiDefaults({});
    }
  }
);
