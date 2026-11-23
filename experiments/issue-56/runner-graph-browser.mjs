import assert from 'node:assert/strict';
import { once } from 'node:events';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import {
  runnerGraphBackend,
  runnerGraphFixture,
} from './runner-graph-fixture.mjs';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';

const before = process.argv.includes('--before');
const application = await runnerGraphFixture();
try {
  const backend = runnerGraphBackend({ launchFails: true });
  const fixture = await runnerApiFixture({
    backend,
    overlay: { server: application.target },
  });
  try {
    if (process.argv.includes('--serve')) {
      console.log(JSON.stringify({ origin: fixture.base, pid: process.pid }));
      await once(process, 'SIGTERM');
    } else {
      await runBrowserScenarios('runner-graph', [
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
            await local.locator('[data-runner-state=running]').waitFor();
            const reply = page.waitForResponse(/\/api\/runner\/start$/u);
            await server.locator('[data-runner-action=start]').click();
            const response = await reply;
            assert.equal(response.status(), 200);
            await panel
              .getByText(
                before
                  ? /^The action was not confirmed/u
                  : /^The selected host failed to load the application/u
              )
              .waitFor();
            await local
              .locator(`[data-runner-state=${before ? 'stopped' : 'running'}]`)
              .waitFor();
            await server.locator('[data-runner-state=stopped]').waitFor();
            await captureVkAutomationLayouts(
              page,
              panel,
              'docs/screenshots/issue-56-runner-graph',
              before ? 'before' : 'after',
              true
            );
            assert.deepEqual(errors, []);
            return { status: response.status(), states: backend.state };
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
        states: backend.state,
        controls: backend.calls.filter(([, action]) => action !== 'probe'),
        graphChecks: backend.graphChecks.length,
        resourcesClosed: true,
      })
    );
  }
} finally {
  await application.close();
}
