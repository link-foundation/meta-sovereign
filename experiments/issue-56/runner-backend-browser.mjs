import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { runnerRequestPath } from '../../js/src/transport/runner-receipt.js';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import { runnerFixture } from './runner-fixture.mjs';

const [, , variant, ref] = process.argv;
const before = variant === '--before';
const backend = runnerFixture({ local: 'running', server: 'unknown' });
const run = backend.run;
backend.run = (target, argv, options) =>
  target.host && target.directory === '/' && argv[0] === 'sh'
    ? { code: 0, stdout: 'missing' }
    : run(target, argv, options);
backend.health.server = 'unknown';
const fixture = await runnerApiFixture({ backend });

try {
  if (variant === '--serve') {
    console.log(JSON.stringify({ origin: fixture.base, pid: process.pid }));
    await once(process, 'SIGTERM');
  } else {
    await runBrowserScenarios('runner-backend-inspection', [
      async (browser) => {
        const { context, page, errors } = await vkAutomationBrowser(
          browser,
          '',
          fixture.base
        );
        try {
          if (before) {
            assert.match(ref ?? '', /^[a-f0-9]{40}$/u);
            const { stdout: body } = await promisify(execFile)(
              'git',
              ['show', `${ref}:js/src/web/app.min.js`],
              { maxBuffer: 12 * 1024 * 1024 }
            );
            await page.route('**/app.min.js*', (route) =>
              route.fulfill({ contentType: 'text/javascript', body })
            );
          }
          await page.goto(`${fixture.base}/#settings`);
          const summary = page.locator('[data-runner-open]');
          await summary.click();
          const panel = summary.locator('..');
          const local = panel.locator('[data-runner-mode=local]');
          const server = panel.locator('[data-runner-mode=server]');
          await server.locator('[data-runner-state=unknown]').waitFor();
          await server.locator('[data-runner-action=inspect]').click();
          await server.locator('[data-runner-health=unknown]').waitFor();
          const diagnosis = server.locator('[data-runner-backend=missing]');
          if (before) {
            assert.equal(await diagnosis.count(), 0);
          } else {
            await diagnosis.waitFor();
            assert.match(await diagnosis.innerText(), /GNU Screen/u);
            const status = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname === runnerRequestPath('status')
            );
            await panel.locator('[data-runner-action=refresh]').click();
            assert.equal((await status).status(), 200);
            await panel.locator('[aria-busy=false]').waitFor();
            await diagnosis.waitFor();
          }
          assert.equal(
            await server.locator('[data-runner-action=start]').isEnabled(),
            false
          );
          assert.equal(
            await local.locator('[data-runner-action=stop]').isEnabled(),
            true
          );
          await captureVkAutomationLayouts(
            page,
            panel,
            'docs/screenshots/issue-56-runner-backend',
            before ? 'before' : 'after',
            true
          );
          assert.deepEqual(errors, []);
          return {
            before,
            backend: await diagnosis.count(),
            peerRunning: true,
          };
        } finally {
          await context.close();
        }
      },
    ]);
  }
} finally {
  await fixture.close();
  assert.equal(backend.state.local, 'running');
  assert.ok(
    backend.calls.every(([, action]) => ['probe', 'health'].includes(action))
  );
  console.log(
    JSON.stringify({ peerRunning: true, mutations: 0, resourcesClosed: true })
  );
}
