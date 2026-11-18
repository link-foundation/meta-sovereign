import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { jobBrowserProfile } from '../src/jobs/browser-profile.js';
import { jobBrowserDependencies } from '../src/jobs/browser-dependencies.js';
import { openBrowserSession } from '../src/cv/browser.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveBrowserPolicy } from '../src/browser/policy.js';

const fixture = async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'ms-job-cookie-'));
  t.after(() => rm(storeDir, { recursive: true, force: true }));
  const base = path.join(storeDir, 'browser-profiles', 'hh');
  return {
    storeDir,
    canonical: path.join(base, 'slots', 'jobs'),
    legacy: path.join(base, 'jobs'),
    async saved(directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'Local State'),
        'synthetic-cookie-owner'
      );
    },
  };
};

test(
  'new job profiles isolate named slots and workspaces without creating directories',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    assert.equal(await jobBrowserProfile(f), f.canonical);
    assert.notEqual(
      await jobBrowserProfile({ ...f, browserSlot: 'other' }),
      f.canonical
    );
    assert.notEqual(
      await jobBrowserProfile({ storeDir: path.join(f.storeDir, 'other') }),
      f.canonical
    );
    assert.equal(
      await jobBrowserProfile({ ...f, browserSlot: 'main' }),
      path.dirname(path.dirname(f.canonical))
    );
    await assert.rejects(readFile(path.join(f.canonical, 'Local State')), {
      code: 'ENOENT',
    });
    await assert.rejects(
      jobBrowserProfile({ ...f, browserSlot: '../foreign' })
    );
  }
);

for (const location of ['canonical', 'legacy']) {
  test(
    `existing ${location} job cookies are selected in place`,
    { timeout: 5000 },
    async (t) => {
      const f = await fixture(t);
      await f.saved(f[location]);
      assert.equal(await jobBrowserProfile(f), f[location]);
      assert.equal(
        await readFile(path.join(f[location], 'Local State'), 'utf8'),
        'synthetic-cookie-owner'
      );
      const other = location === 'canonical' ? 'legacy' : 'canonical';
      await assert.rejects(readFile(path.join(f[other], 'Local State')), {
        code: 'ENOENT',
      });
    }
  );
}

test(
  'distinct existing HH accounts refuse launch without touching either profile',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    await f.saved(f.canonical);
    await f.saved(f.legacy);
    let launches = 0;
    const dependencies = jobBrowserDependencies({
      ...f,
      openSession: async () => {
        launches++;
      },
    });
    await assert.rejects(
      dependencies.openSession({ platform: 'hh', slot: 'jobs' }),
      { code: 'jobs-browser-profile-conflict' }
    );
    assert.equal(launches, 0);
    for (const directory of [f.canonical, f.legacy]) {
      assert.equal(
        await readFile(path.join(directory, 'Local State'), 'utf8'),
        'synthetic-cookie-owner'
      );
    }
  }
);

test(
  'a locked legacy main or slots profile is retained without mistaking its parent for an account',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    for (const browserSlot of ['main', 'slots']) {
      const storeDir = path.join(f.storeDir, browserSlot);
      const legacy = path.join(storeDir, 'browser-profiles', 'hh', browserSlot);
      await mkdir(legacy, { recursive: true });
      await writeFile(path.join(legacy, 'SingletonLock'), 'owned-profile');
      assert.equal(await jobBrowserProfile({ storeDir, browserSlot }), legacy);
      assert.equal(
        await readFile(path.join(legacy, 'SingletonLock'), 'utf8'),
        'owned-profile'
      );
    }
  }
);

test(
  'shared job profiles retain headed defaults and case, slot and explicit visibility',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const store = createMemoryStore();
    const launches = [];
    const dependencies = jobBrowserDependencies({
      ...f,
      openSession: (options) =>
        openBrowserSession({
          ...options,
          importers: {
            'browser-commander': async () => ({
              makeBrowserCommander: () => ({}),
            }),
          },
          launcher: async (options) => {
            launches.push(options);
            return { close: async () => {} };
          },
        }),
    });
    const open = async (options = {}) => {
      const browser = await dependencies.openSession({
        store,
        platform: 'hh',
        useCase: 'jobs',
        slot: 'jobs',
        ...options,
      });
      await browser.close();
    };
    await open();
    await saveBrowserPolicy(store, {
      scope: 'case',
      key: 'jobs',
      headless: true,
    });
    await open();
    await saveBrowserPolicy(store, {
      scope: 'slot',
      key: 'hh/jobs',
      headless: false,
    });
    await open();
    await open({ headless: true });
    assert.deepEqual(
      launches.map((entry) => entry.headless),
      [false, true, false, true]
    );
    assert(launches.every((entry) => entry.profileDir === f.canonical));
  }
);

test(
  'CV watch and preparation attach to the same existing workspace profile without launching',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    await f.saved(f.legacy);
    const endpoint = 'ws://127.0.0.1:9222/devtools/browser/fixture-id';
    await writeFile(
      path.join(f.legacy, '.browser-commander-session.json'),
      JSON.stringify({
        userDataDir: f.legacy,
        webSocketDebuggerUrl: endpoint,
        remoteDebuggingPort: 9222,
        targetId: 'fixtureTab',
      })
    );
    const connections = [];
    let detached = 0;
    const dependencies = jobBrowserDependencies(f);
    for (const method of [
      dependencies.cvWatch.attach,
      dependencies.cvPrepare.attach,
    ]) {
      const session = await method({
        browserSlot: 'jobs',
        loadCommander: async () => ({
          connectBrowser: async (options) => {
            connections.push(options);
            return {
              page: { url: () => 'https://hh.ru/resume/fixture' },
              detach: async () => {
                detached++;
              },
            };
          },
          makeBrowserCommander: () => ({ destroy: async () => {} }),
        }),
      });
      await session.detach();
    }
    assert.equal(connections.length, 2);
    assert.equal(detached, 2);
    assert(
      connections.every(
        (entry) =>
          entry.wsEndpoint === endpoint &&
          entry.fallback === false &&
          entry.targetId === 'fixtureTab'
      )
    );
  }
);

test(
  'injected CV connectors and non-HH or explicit profiles remain supported',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const watch = async () => {};
    const prepare = async () => {};
    const dependencies = jobBrowserDependencies({
      ...f,
      openSession: async (options) => options,
      cvWatch: { attach: watch },
      cvPrepare: { attach: prepare },
    });
    assert.equal(dependencies.cvWatch.attach, watch);
    assert.equal(dependencies.cvPrepare.attach, prepare);
    assert.deepEqual(
      await dependencies.openSession({ platform: 'telegram', slot: 'main' }),
      { platform: 'telegram', slot: 'main' }
    );
    assert.equal(
      (
        await dependencies.openSession({
          platform: 'hh',
          profileDir: '/explicit/profile',
        })
      ).profileDir,
      '/explicit/profile'
    );
  }
);

test(
  'job profile diagnostics are silent by default and disclose only the selection',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const previous = process.env.MS_JOBS_BROWSER_DEBUG;
    const original = console.error;
    const events = [];
    t.after(() => {
      console.error = original;
      if (previous === undefined) {
        delete process.env.MS_JOBS_BROWSER_DEBUG;
      } else {
        process.env.MS_JOBS_BROWSER_DEBUG = previous;
      }
    });
    console.error = (entry) => events.push(entry);
    delete process.env.MS_JOBS_BROWSER_DEBUG;
    await jobBrowserProfile(f);
    assert.deepEqual(events, []);
    process.env.MS_JOBS_BROWSER_DEBUG = '1';
    await jobBrowserProfile(f);
    await f.saved(f.legacy);
    await jobBrowserProfile(f);
    await f.saved(f.canonical);
    await assert.rejects(jobBrowserProfile(f), {
      code: 'jobs-browser-profile-conflict',
    });
    assert.deepEqual(
      events,
      ['new', 'legacy', 'conflict'].map((selection) => ({
        event: 'jobs-browser-profile',
        selection,
      }))
    );
    assert(!JSON.stringify(events).includes(f.storeDir));
  }
);
