import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as commander from 'browser-commander';
import * as playwright from 'playwright';
import { openBrowserSession } from '../../js/src/cv/browser.js';
import { jobBrowserDependencies } from '../../js/src/jobs/browser-dependencies.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { fixtureServerClose } from '../../js/tests/helpers/fixture-server.mjs';

/** Four sequential launches, only loopback traffic and disposable profiles. */
export const verifyJobBrowserCookies = async (executablePath) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ms-hh-cookies-'));
  const store = createMemoryStore();
  const launches = [];
  let session;
  const server = http.createServer((request, response) => {
    if (request.url === '/sign-in') {
      response.setHeader(
        'set-cookie',
        'fixture-session=present; HttpOnly; SameSite=Strict; Path=/'
      );
    }
    response.setHeader('content-type', 'text/plain');
    response.end(
      request.headers.cookie?.includes('fixture-session=present')
        ? 'present'
        : 'absent'
    );
  });
  const close = fixtureServerClose(server, 'jobs-browser-cookie');
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const dependencies = (workspace) =>
      jobBrowserDependencies({
        storeDir: path.join(directory, workspace),
        openSession: (options) => {
          assert(options.profileDir.startsWith(`${directory}${path.sep}`));
          return openBrowserSession({
            ...options,
            importers: {
              playwright: async () => playwright,
              'browser-commander': async () => ({
                ...commander,
                launchBrowser: async (launch) => {
                  const browser = await commander.launchBrowser({
                    ...launch,
                    executablePath,
                    args: [...launch.args, '--no-sandbox'],
                  });
                  launches.push({
                    profileDir: launch.userDataDir,
                    headless: launch.headless,
                    keepSessionCookies: browser.keepSessionCookies,
                  });
                  return browser;
                },
              }),
            },
          });
        },
      });
    const open = async (workspace, slot) => {
      session = await dependencies(workspace).openSession({
        store,
        platform: 'hh',
        useCase: 'jobs',
        slot,
        headless: true,
      });
      await session.page.goto(`${base}/read`, { timeout: 10000 });
      return session.page.locator('body').innerText();
    };
    const shut = async () => {
      await session.close();
      session = null;
    };
    assert.equal(await open('first', 'jobs'), 'absent');
    await session.page.goto(`${base}/sign-in`, { timeout: 10000 });
    const cookie = (await session.page.context().cookies(base)).find(
      (value) => value.name === 'fixture-session'
    );
    assert(cookie?.httpOnly);
    assert.equal(
      cookie.expires,
      -1,
      'a session cookie, without a persistent expiry'
    );
    await shut();
    assert.equal(await open('first', 'jobs'), 'present');
    await shut();
    assert.equal(await open('first', 'other'), 'absent');
    await shut();
    assert.equal(await open('second', 'jobs'), 'absent');
    await shut();
    assert.equal(launches.length, 4);
    assert.equal(launches[0].profileDir, launches[1].profileDir);
    assert.equal(new Set(launches.map((value) => value.profileDir)).size, 3);
    assert(
      launches.every((value) => value.headless && value.keepSessionCookies)
    );
    return {
      launches: 4,
      sessionCookieRetained: true,
      slotIsolated: true,
      workspaceIsolated: true,
      headless: true,
      liveProvider: false,
    };
  } finally {
    try {
      await session?.close();
    } finally {
      await close();
      await store.close?.();
      await rm(directory, { recursive: true, force: true });
    }
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(
    '[jobs-browser-cookie]',
    JSON.stringify(
      await verifyJobBrowserCookies(
        process.env.E2E_EXECUTABLE_PATH ?? playwright.chromium.executablePath()
      )
    )
  );
}
