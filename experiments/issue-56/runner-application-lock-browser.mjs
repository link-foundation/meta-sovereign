import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readlink } from 'node:fs/promises';
import path from 'node:path';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';
import { createRunnerApplicationPreparation } from '../../js/src/server/runner-application.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import { runnerApplicationFixture } from './runner-application-fixture.mjs';
import { runnerGraphBackend } from './runner-graph-fixture.mjs';

const before = process.argv.includes('--before');
const application = await runnerApplicationFixture();
let installs = 0;
try {
  const backend = runnerGraphBackend();
  const prepareApplication = createRunnerApplicationPreparation({
    install: ({ host: _host, ...target }, ...args) => {
      assert.equal(backend.state.local, 'running');
      installs++;
      return runRunnerCommand(target, ...args);
    },
  });
  const fixture = await runnerApiFixture({
    backend,
    overlay: { server: application.target },
    control: { prepareApplication },
  });
  try {
    if (process.argv.includes('--serve')) {
      console.log(JSON.stringify({ origin: fixture.base, pid: process.pid }));
      await once(process, 'SIGTERM');
    } else {
      await runBrowserScenarios('runner-application-lock', [
        async (browser) => {
          const { context, page, errors } = await vkAutomationBrowser(
            browser,
            '',
            fixture.base
          );
          try {
            await page.goto(`${fixture.base}/#settings`);
            const panel = page.locator('[data-runner-settings]');
            await panel.locator('[data-runner-open]').click();
            const server = panel.locator('[data-runner-mode=server]');
            const local = panel.locator('[data-runner-mode=local]');
            if (before) {
              await panel
                .getByText(/^Current status is unavailable/u)
                .waitFor({ timeout: 10000 });
              assert(
                await server.locator('[data-runner-action=start]').isDisabled()
              );
            } else {
              await local.locator('[data-runner-state=running]').waitFor();
              await panel.locator('[data-runner-profile-open]').click();
              const document = panel.locator('[data-runner-profile-document]');
              await document.waitFor();
              await page.waitForFunction(() =>
                globalThis.document
                  .querySelector('[data-runner-profile-document]')
                  ?.value.includes('applicationLock ')
              );
              assert(
                (await document.inputValue()).includes(
                  `applicationLock ${application.target.applicationLock}`
                )
              );
              await captureVkAutomationLayouts(
                page,
                panel.locator('[data-runner-profile]'),
                'docs/screenshots/issue-56-runner-application-lock',
                'profile',
                true
              );
              await panel.locator('[data-runner-profile-open]').click();
              const reply = page.waitForResponse(/\/api\/runner\/start$/u);
              await server.locator('[data-runner-action=start]').click();
              assert.equal((await reply).status(), 200);
              await local.locator('[data-runner-state=stopped]').waitFor();
              await server.locator('[data-runner-state=running]').waitFor();
              assert(
                await readlink(
                  path.join(application.target.directory, 'node_modules')
                )
              );
            }
            await captureVkAutomationLayouts(
              page,
              panel,
              'docs/screenshots/issue-56-runner-application-lock',
              before ? 'before' : 'after',
              true
            );
            assert.deepEqual(errors, []);
            return { approvedLock: !before, installs, states: backend.state };
          } finally {
            await context.close();
          }
        },
      ]);
    }
  } finally {
    await fixture.close();
    console.log(
      JSON.stringify({
        installs,
        states: backend.state,
        controls: backend.calls.filter(([, action]) => action !== 'probe'),
        resourcesClosed: true,
      })
    );
  }
} finally {
  await application.close();
}
