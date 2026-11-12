import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { attachCvWatchBrowser } from '../../js/src/jobs/cv-watch-browser.js';

// One owned Chromium process. No real provider requests or existing application.
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const profile = await mkdtemp(path.join(tmpdir(), 'ms-cv-cdp-'));
const context = await chromium.launchPersistentContext(profile, {
  args: [`--remote-debugging-port=${port}`],
  ...(process.env.E2E_EXECUTABLE_PATH
    ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
    : {}),
});
let attached;
try {
  const page = context.pages()[0];
  let requests = 0;
  await context.route('**/*', (route) => {
    requests++;
    return route.fulfill({
      contentType: 'text/html',
      body: '<textarea>Owner draft</textarea>',
    });
  });
  await page.goto('https://hh.ru/resume/edit/abc123/about');
  const connection = await context.newCDPSession(page);
  const { targetInfo } = await connection.send('Target.getTargetInfo');
  await connection.detach();
  const version = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  await writeFile(
    path.join(profile, '.browser-commander-session.json'),
    JSON.stringify({
      userDataDir: profile,
      remoteDebuggingPort: port,
      webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      targetId: targetInfo.targetId,
    })
  );
  const initial = requests;
  attached = await attachCvWatchBrowser({
    browserSlot: 'jobs',
    profileDir: profile,
  });
  assert.equal(attached.page.url(), page.url());
  await attached.detach();
  attached = null;
  assert.equal(page.isClosed(), false);
  assert.equal(await page.locator('textarea').inputValue(), 'Owner draft');
  assert.equal(requests, initial);
  await assert.rejects(
    attachCvWatchBrowser({
      browserSlot: 'jobs',
      profileDir: profile,
      targetId: 'MISSING',
    })
  );
  assert.equal(page.isClosed(), false);
  assert.equal(context.pages().length, 1);
  assert.equal(requests, initial);
  console.log(
    JSON.stringify({
      cases: 2,
      exactNativeTarget: true,
      ownerTabOpen: true,
      extraProviderRequests: requests - initial,
    })
  );
} finally {
  await attached?.detach();
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
