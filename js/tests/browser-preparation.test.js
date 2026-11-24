import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBrowserPreparation,
  installBrowserExecutable,
} from '../src/browser/preparation.js';
import { launchWithCommander } from '../src/cv/browser.js';
import { launchPersistentBrowser } from '../src/cv/persistent-browser.js';
import { launchWithBrowserCommander } from '../src/sources/auto-import/manager.js';

const bounded = { timeout: 5000 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const fakeEngine =
  (file = '/synthetic/browser') =>
  async () => ({
    chromium: { executablePath: () => file },
  });
const preparedPage = () => ({
  context: () => ({
    newCDPSession: async () => ({
      send: async () => ({ targetInfo: { targetId: 'A123' } }),
      detach: async () => {},
    }),
  }),
});
const preparationFixture = async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ms-browser-prepare-')
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test(
  'first use prepares a missing executable through a drained child and reuses it',
  bounded,
  async (t) => {
    const directory = await preparationFixture(t);
    const cli = path.join(directory, 'install.cjs');
    await copyFile(
      fileURLToPath(
        new URL(
          '../../experiments/issue-56/browser-preparation-installer.cjs',
          import.meta.url
        )
      ),
      cli
    );
    let children = 0;
    const prepare = createBrowserPreparation({
      load: fakeEngine(path.join(directory, 'prepared-browser')),
      install: async (options) => {
        children += 1;
        await installBrowserExecutable({ ...options, cli });
      },
    });
    await prepare();
    await prepare();
    assert.equal(children, 1);
  }
);

test(
  'an executable directory is refused rather than accepted as a ready browser',
  bounded,
  async (t) => {
    const directory = await preparationFixture(t);
    let installs = 0;
    const prepare = createBrowserPreparation({
      load: fakeEngine(directory),
      install: async () => {
        installs += 1;
      },
    });
    await assert.rejects(prepare(), {
      code: 'browser-preparation-unconfirmed',
    });
    assert.equal(installs, 1);
  }
);

test(
  'concurrent launches share preparation while a cancelled owner leaves the other intact',
  bounded,
  async () => {
    const started = deferred();
    const release = deferred();
    let present = false;
    let installs = 0;
    const prepare = createBrowserPreparation({
      load: fakeEngine(),
      ready: async () => present,
      install: async ({ signal }) => {
        installs += 1;
        started.resolve(signal);
        await release.promise;
        present = true;
      },
    });
    const abort = new AbortController();
    const first = prepare({ signal: abort.signal });
    const rejected = assert.rejects(first, {
      code: 'browser-preparation-stopped',
    });
    const second = prepare();
    const ownedSignal = await started.promise;
    abort.abort();
    await rejected;
    assert.equal(ownedSignal.aborted, false);
    release.resolve();
    await second;
    assert.equal(installs, 1);
  }
);

test(
  'the last cancelled owner waits for installer drainage before a later explicit retry',
  bounded,
  async () => {
    const started = deferred();
    const closed = deferred();
    let present = false;
    let installSignal;
    const prepare = createBrowserPreparation({
      load: fakeEngine(),
      ready: async () => present,
      install: async ({ signal }) => {
        installSignal = signal;
        started.resolve();
        await closed.promise;
        if (signal.aborted) {
          throw new Error('stopped private diagnostic');
        }
        present = true;
      },
    });
    const abort = new AbortController();
    let settled = false;
    const first = prepare({ signal: abort.signal });
    const checked = assert.rejects(
      first.finally(() => {
        settled = true;
      }),
      { code: 'browser-preparation-stopped' }
    );
    await started.promise;
    abort.abort();
    await Promise.resolve();
    assert(installSignal.aborted);
    assert.equal(settled, false);
    closed.resolve();
    await checked;
    await prepare();
    assert(present);
  }
);

test(
  'a newly visible executable does not release another owner before installation closes',
  bounded,
  async () => {
    const started = Promise.withResolvers();
    const closed = Promise.withResolvers();
    let present = false;
    const prepare = createBrowserPreparation({
      load: fakeEngine(),
      ready: async () => present,
      install: async () => {
        present = true;
        started.resolve();
        await closed.promise;
      },
    });
    const first = prepare();
    await started.promise;
    let finished = false;
    const second = prepare().then(() => {
      finished = true;
    });
    // Wait beyond the loader and filesystem promise boundaries without a timer.
    for (let phase = 0; phase < 12; phase++) {
      await Promise.resolve();
    }
    assert.equal(finished, false);
    closed.resolve();
    await Promise.all([first, second]);
  }
);

test(
  'failed preparation hides private child diagnostics and permits an explicit retry',
  bounded,
  async () => {
    let attempts = 0;
    let present = false;
    const prepare = createBrowserPreparation({
      load: fakeEngine(),
      ready: async () => present,
      install: async () => {
        if (++attempts === 1) {
          const proxy = new URL('https://private.proxy.invalid');
          proxy.username = 'owner';
          proxy.password = 'secret';
          throw new Error(proxy.href);
        }
        present = true;
      },
    });
    await assert.rejects(
      prepare(),
      (error) =>
        error.code === 'browser-preparation-failed' &&
        !error.message.includes('secret')
    );
    await prepare();
    assert.equal(attempts, 2);
  }
);

test(
  'cancelled and unconfirmed preparation never dispatch a native browser launch',
  bounded,
  async () => {
    let launches = 0;
    const bc = {
      launchBrowser: async () => {
        launches += 1;
      },
    };
    const signal = globalThis.AbortSignal.abort();
    const prepare = createBrowserPreparation({
      load: () => {
        throw new Error('must not load');
      },
    });
    await assert.rejects(launchWithCommander({ bc, prepare, signal }), {
      code: 'browser-preparation-stopped',
    });
    const unconfirmed = createBrowserPreparation({
      load: fakeEngine(),
      ready: async () => false,
      install: async () => {},
    });
    await assert.rejects(launchWithCommander({ bc, prepare: unconfirmed }), {
      code: 'browser-preparation-unconfirmed',
    });
    assert.equal(launches, 0);
  }
);

for (const persistent of [false, true]) {
  test(
    `${persistent ? 'persistent' : 'regular'} first launches prepare before opening with their existing visibility`,
    bounded,
    async (t) => {
      const profileDir = await preparationFixture(t);
      let prepared = false;
      const opened = [];
      const launch = async (options) => {
        assert(prepared, 'missing executable must be prepared before launch');
        opened.push(options);
        return {
          page: preparedPage(),
          close: async () => {},
          browserProcess: { pid: 90210, exitCode: 0, signalCode: null },
        };
      };
      const browser = await launchWithCommander({
        bc: { launchBrowser: launch, connectOrLaunch: launch },
        profileDir,
        persistent,
        headless: false,
        prepare: async () => {
          prepared = true;
        },
      });
      assert.equal(opened[0].headless, false);
      await browser.close();
    }
  );
}

test(
  'existing exact-target watcher connections do not install a replacement browser',
  bounded,
  async (t) => {
    const profileDir = await preparationFixture(t);
    await writeFile(
      path.join(profileDir, '.browser-commander-session.json'),
      JSON.stringify({ remoteDebuggingPort: 45678 })
    );
    const browser = await launchPersistentBrowser({
      profileDir,
      targetId: 'A123',
      prepare: async () => {
        throw new Error('must not install');
      },
      bc: {
        connectOrLaunch: async () => ({
          browserProcess: { pid: 90210, exitCode: 0, signalCode: null },
          page: preparedPage(),
          close: async () => {},
        }),
      },
    });
    await browser.close();
  }
);

test(
  'cancellation immediately after preparation still refuses native launch',
  bounded,
  async () => {
    const controller = new AbortController();
    let opened = false;
    await assert.rejects(
      launchWithCommander({
        signal: controller.signal,
        prepare: async () => controller.abort(),
        bc: {
          launchBrowser: async () => {
            opened = true;
          },
        },
      }),
      { name: 'AbortError' }
    );
    assert.equal(opened, false);
  }
);

test(
  'auto-import prepares only its managed browser and preserves explicit connections and selections',
  bounded,
  async () => {
    for (const env of [
      {},
      { MS_BROWSER_CDP_URL: 'http://127.0.0.1:9222' },
      { MS_BROWSER_CHANNEL: 'chrome' },
      { MS_BROWSER_EXECUTABLE: '/chosen/browser' },
    ]) {
      let prepared = 0;
      const bc = {
        launchBrowser: async (options) => {
          assert.equal(prepared, Object.keys(env).length ? 0 : 1);
          assert.equal(options.headless, false);
          throw new Error('launch boundary reached');
        },
        connectBrowser: async () => {
          assert.equal(prepared, 0);
          throw new Error('launch boundary reached');
        },
      };
      await assert.rejects(
        launchWithBrowserCommander({
          env,
          loadCommander: async () => bc,
          prepare: async () => {
            prepared += 1;
          },
        }),
        /launch boundary reached/
      );
    }
  }
);
