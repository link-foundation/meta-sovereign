import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { launchPersistentBrowser } from '../src/cv/persistent-browser.js';
import {
  createPersistentClose,
  persistentProcessOwner,
} from '../src/cv/persistent-process.js';

const bounded = { timeout: 4000 };
const fixture = async (run) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ms-persistent-process-')
  );
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const nativePage = () => ({
  context: () => ({
    newCDPSession: async () => ({
      send: async () => ({ targetInfo: { targetId: 'A123' } }),
      detach: async () => {},
    }),
  }),
});

test(
  'a failed persistent target read drains its captured owner before returning',
  bounded,
  () =>
    fixture(async (profileDir) => {
      const child = { pid: process.pid, exitCode: null, signalCode: null };
      const refused = new Error('synthetic target read refusal');
      let closeRequested;
      const requested = new Promise((resolve) => {
        closeRequested = resolve;
      });
      const page = nativePage();
      page.context = () => ({
        newCDPSession: async () => {
          throw refused;
        },
      });
      let completed = false;
      const opening = launchPersistentBrowser({
        profileDir,
        targetId: 'A123',
        idleMs: 1000,
        bc: {
          connectOrLaunch: async () => ({
            page,
            browserProcess: child,
            close: async () => {
              closeRequested();
            },
          }),
        },
      }).catch((error) => {
        completed = true;
        return error;
      });
      try {
        await requested;
        await setImmediate();
        assert.equal(completed, false);
        child.exitCode = 0;
        assert.equal(await opening, refused);
      } finally {
        child.exitCode = 0;
        await opening;
      }
    })
);

test(
  'persistent Close retains ownership after the SDK acknowledgement until its native child exits',
  bounded,
  () =>
    fixture(async (profileDir) => {
      // A finite fake child uses this process only for the read-only alive probe.
      const child = { pid: process.pid, exitCode: null, signalCode: null };
      let calls = 0;
      let completed = false;
      const browser = await launchPersistentBrowser({
        profileDir,
        targetId: 'A123',
        idleMs: 1000,
        bc: {
          connectOrLaunch: async () => ({
            page: nativePage(),
            browserProcess: child,
            close: async () => {
              calls++;
            },
            detach: async () => {},
          }),
        },
      });
      const closing = browser.close().then(() => {
        completed = true;
      });
      const repeated = browser.close();
      try {
        await setImmediate();
        assert.equal(completed, false, 'a close response is not process exit');
        assert.equal(calls, 1);
        child.exitCode = 0;
        await closing;
        await repeated;
        assert.equal(completed, true);
        assert.equal(calls, 1);
      } finally {
        child.exitCode = 0;
        await Promise.allSettled([closing, repeated]);
      }
    })
);

test(
  'reattached persistent ownership is captured before SDK metadata removal',
  bounded,
  () =>
    fixture(async (profileDir) => {
      const file = path.join(profileDir, '.browser-commander-session.json');
      await writeFile(
        file,
        JSON.stringify({
          pid: 90210,
          userDataDir: profileDir,
          remoteDebuggingPort: 45678,
        })
      );
      const session = {
        cdpEndpoint: 'http://127.0.0.1:45678',
        close: async () => rm(file),
      };
      const owner = await persistentProcessOwner(session, profileDir);
      assert.deepEqual(owner, { pid: 90210 });
      let reads = 0;
      await createPersistentClose(session, owner, {
        isAlive: (pid) => {
          assert.equal(pid, 90210);
          return ++reads < 3;
        },
        pause: async () => {},
      })();
      assert.equal(reads, 3);
    })
);

test(
  'persistent metadata with a foreign profile, endpoint or invalid PID refuses without exposing values',
  bounded,
  () =>
    fixture(async (profileDir) => {
      for (const changed of [
        { pid: 0 },
        { userDataDir: '/private-owner-path' },
        { remoteDebuggingPort: 45679 },
      ]) {
        await writeFile(
          path.join(profileDir, '.browser-commander-session.json'),
          JSON.stringify({
            pid: 90210,
            userDataDir: profileDir,
            remoteDebuggingPort: 45678,
            ...changed,
          })
        );
        await assert.rejects(
          persistentProcessOwner(
            { cdpEndpoint: 'http://127.0.0.1:45678' },
            profileDir
          ),
          {
            code: 'browser-close-unconfirmed',
            message: 'Persistent browser process closure was not confirmed.',
          }
        );
      }
    })
);

test(
  'a still-live persistent owner refuses within its finite drainage budget without signalling it',
  bounded,
  async () => {
    let clock = 0;
    let reads = 0;
    const close = createPersistentClose(
      { close: async () => {} },
      { pid: 90210 },
      {
        now: () => clock,
        deadlineMs: 50,
        pause: async (ms) => {
          clock += ms;
        },
        isAlive: () => {
          reads++;
          return true;
        },
      }
    );
    await assert.rejects(close(), { code: 'browser-close-unconfirmed' });
    assert.equal(clock, 50);
    assert.equal(reads, 3);
  }
);

test(
  'failed close requests still drain their owner before returning the original refusal',
  bounded,
  async () => {
    let clock = 0;
    const refused = new Error('synthetic SDK refusal');
    const close = createPersistentClose(
      {
        close: async () => {
          throw refused;
        },
      },
      { pid: 90210 },
      {
        now: () => clock,
        pause: async (ms) => {
          clock += ms;
        },
        isAlive: () => clock < 50,
      }
    );
    await assert.rejects(close(), (error) => error === refused);
    assert.equal(clock, 50);
  }
);

test(
  'an already exited child is not probed by its reusable PID',
  bounded,
  async () => {
    await createPersistentClose(
      { close: async () => {} },
      { pid: 90210, child: { signalCode: 'SIGTERM' } },
      {
        isAlive: () => {
          throw new Error('a reused PID must not be inspected');
        },
      }
    )();
  }
);
