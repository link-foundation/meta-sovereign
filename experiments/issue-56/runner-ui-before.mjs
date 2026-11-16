import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from '../../js/tests/helpers/vk-automation-browser.mjs';

const browser = await webkit.launch({ headless: true });
let fixture;
let context;
try {
  fixture = await runnerApiFixture();
  const view = await vkAutomationBrowser(browser, '', fixture.base);
  context = view.context;
  const { page, errors } = view;
  await page.goto(`${fixture.base}/#settings`);
  const heading = page.getByRole('heading', { name: 'Settings', exact: true });
  await heading.waitFor();
  assert.equal(await page.locator('[data-runner-settings]').count(), 0);
  await captureVkAutomationLayouts(
    page,
    heading,
    'docs/screenshots',
    'issue-56-runner-before'
  );
  assert.deepEqual(fixture.backend.calls, []);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      missingRunnerControls: true,
      launched: false,
      liveProvider: false,
    })
  );
} finally {
  await context?.close();
  await fixture?.close();
  await browser.close();
}
