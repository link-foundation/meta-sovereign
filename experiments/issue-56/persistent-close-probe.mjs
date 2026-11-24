// One private native browser: distinguish a close acknowledgement from exit.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import * as bc from 'browser-commander';
import { launchPersistentBrowser } from '../../js/src/cv/persistent-browser.js';

const directory = await mkdtemp(join(tmpdir(), 'ms-persistent-close-'));
let raw;
let browser;
let reattached;
const exited = () =>
  raw?.browserProcess?.exitCode !== null ||
  raw?.browserProcess?.signalCode !== null;
const cleanup = async () => {
  const closed = await Promise.allSettled([
    reattached?.close(),
    browser?.close(),
  ]);
  if (raw?.browserProcess && !exited()) {
    raw.browserProcess.kill('SIGTERM');
    for (let attempt = 0; attempt < 200 && !exited(); attempt++) {
      await delay(25);
    }
    assert(exited(), 'owned child cleanup must finish before profile removal');
  }
  await rm(directory, { recursive: true, force: true });
  const refused = closed.find((result) => result.status === 'rejected');
  if (refused) {
    throw refused.reason;
  }
};
try {
  browser = await launchPersistentBrowser({
    bc: {
      connectOrLaunch: async (options) => {
        raw = await bc.connectOrLaunch(options);
        return raw;
      },
    },
    profileDir: directory,
    headless: true,
    executablePath:
      process.env.E2E_EXECUTABLE_PATH || '/opt/google/chrome/chrome',
    idleMs: 86400000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  assert(raw.browserProcess);
  const metadata = JSON.parse(
    await readFile(join(directory, '.browser-commander-session.json'), 'utf8')
  );
  assert.equal(metadata.pid, raw.browserProcess.pid);
  await browser.page.setContent('<h1>Private persistent close fixture</h1>');
  if (process.argv.includes('--reuse')) {
    reattached = await launchPersistentBrowser({
      bc,
      profileDir: directory,
      idleMs: 86400000,
      targetId: browser.persistent.targetId,
    });
  }
  const began = Date.now();
  await (reattached || browser).close();
  const exitedAtReturn = exited();
  for (let attempt = 0; attempt < 200 && !exited(); attempt++) {
    await delay(25);
  }
  assert(exited(), 'the one owned native child must drain within five seconds');
  console.log(
    JSON.stringify({
      persistentCloseProbe: true,
      reattached: Boolean(reattached),
      exitedAtReturn,
      exitObservedAfterMs: Date.now() - began,
      liveProvider: false,
    })
  );
  assert.equal(
    exitedAtReturn,
    true,
    'Close must retain its native process owner'
  );
} finally {
  await cleanup();
}
