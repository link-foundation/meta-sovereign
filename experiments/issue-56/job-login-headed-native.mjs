import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { openJobProbeBrowser } from './job-browser-probe.mjs';

assert(process.env.DISPLAY, 'Run this focused headed probe with xvfb-run -a.');
const directory = await mkdtemp(path.join(os.tmpdir(), 'ms-hh-login-'));
const store = createMemoryStore();
const launches = [],
  requests = [];
let session;
const input = { browserSlot: 'manual', requestId: 'first', durationMs: 60000 };
const service = createVacancyService({
  store,
  storeDir: directory,
  openSession: async (options) => {
    assert(options.profileDir.startsWith(`${directory}${path.sep}`));
    session = await openJobProbeBrowser(
      options,
      process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
      launches,
      [
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
        '--proxy-server=direct://',
      ]
    );
    await session.page.context().route('**/*', async (route) => {
      const request = route.request();
      if (
        request.url() !== 'https://hh.ru/account/login' ||
        request.method() !== 'GET'
      ) {
        return route.abort('blockedbyclient');
      }
      requests.push(
        (await request.allHeaders()).cookie?.includes(
          'fixture-session=present'
        ) === true
      );
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><h1>Synthetic manual login</h1><input name="account"><input name="captchaText">',
      });
    });
    return session;
  },
});
try {
  assert.equal(
    (await service['login-open'](input)).login.state,
    'browser-open'
  );
  assert.equal(
    await session.page.locator('input[name=account]').inputValue(),
    ''
  );
  // The fixture operator supplies these synthetic values, never the login service.
  await session.page.locator('input[name=account]').fill('synthetic-owner');
  await session.page.locator('input[name=captchaText]').fill('synthetic-human');
  const context = session.page.context();
  await context.addCookies([
    {
      name: 'fixture-session',
      value: 'present',
      url: 'https://hh.ru',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
  ]);
  assert.equal((await service['login-close'](input)).login.state, 'closed');
  session = null;
  const second = { ...input, requestId: 'second' };
  assert.equal(
    (await service['login-open'](second)).login.authentication,
    'unverified'
  );
  assert.deepEqual(requests, [false, true]);
  assert.equal(launches.length, 2);
  assert.equal(launches[0].profileDir, launches[1].profileDir);
  assert(
    launches.every(
      (launch) => launch.headless === false && launch.keepSessionCookies
    )
  );
  await session.page.close();
  let status;
  for (let i = 0; i < 100; i++) {
    status = await service['login-status'](second);
    if (status.login?.state === 'closed') {
      break;
    }
    await delay(20);
  }
  assert.equal(status.login.state, 'closed');
  session = null;
  console.log(
    '[jobs-login-headed]',
    JSON.stringify({
      launches: 2,
      headless: false,
      sessionCookieRetained: true,
      ownerClosed: true,
      authentication: 'unverified',
      providerSubmissions: 0,
      liveProvider: false,
    })
  );
} finally {
  try {
    await service.stop();
    await session?.close();
  } finally {
    await store.close?.();
    await rm(directory, { recursive: true, force: true });
  }
}
