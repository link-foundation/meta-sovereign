import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { acquireStoreLock } from '../../js/src/storage/store-lock.js';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';
import { runnerApiFixture } from './runner-api-fixture.mjs';

const before = process.argv.includes('--before');
const fixture = await runnerApiFixture();
try {
  const lease = await acquireStoreLock(join(fixture.dir, 'runner-control'), {
    exclusive: true,
  });
  try {
    if (process.argv.includes('--serve')) {
      console.log(JSON.stringify({ origin: fixture.base, pid: process.pid }));
      await once(process, 'SIGTERM');
    } else {
      await runBrowserScenarios('runner-profile-read', [
        async (browser) => {
          const { context, page, errors } = await vkAutomationBrowser(
            browser,
            '',
            fixture.base
          );
          try {
            await page.goto(`${fixture.base}/#settings`);
            await page.locator('[data-runner-open]').click();
            const panel = page.locator('[data-runner-profile]');
            const reply = page.waitForResponse(/\/api\/runner\/profile$/u);
            await panel.locator('[data-runner-profile-open]').click();
            const status = (await reply).status();
            assert.equal(status, before ? 409 : 200);
            const editor = panel.locator('[data-runner-profile-editor]');
            await editor.and(page.locator('[aria-busy=false]')).waitFor();
            const input = editor.locator('[data-runner-profile-document]');
            assert.equal(await input.isEnabled(), !before);
            assert.equal(
              await editor.getByRole('alert').count(),
              before ? 1 : 0
            );
            const savedProfile = (await input.inputValue()).startsWith(
              'runner:'
            );
            assert.equal(savedProfile, !before);
            await captureVkAutomationLayouts(
              page,
              panel,
              'docs/screenshots/issue-56-runner-profile-read',
              before ? 'before' : 'after',
              true
            );
            assert.deepEqual(errors, []);
            return { status, savedProfile };
          } finally {
            await context.close();
          }
        },
      ]);
    }
  } finally {
    await lease.release();
  }
} finally {
  await fixture.close();
  assert.deepEqual(fixture.backend.calls, []);
  console.log(JSON.stringify({ backendCalls: 0, resourcesClosed: true }));
}
