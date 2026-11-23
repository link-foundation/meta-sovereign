import assert from 'node:assert/strict';
import { makeBrowserCommander } from 'browser-commander';
import { hhBrowserImportHtml } from '../../../experiments/issue-56/hh-choice-fixture.mjs';

export const launchHhImportFixture = async (context, url) => {
  const page = await context.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: hhBrowserImportHtml(new URL(route.request().url())),
    })
  );
  await page.goto(url);
  const commander = makeBrowserCommander({
    page,
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  return {
    page,
    commander,
    close: async () => {
      await commander.destroy();
      await page.close();
    },
  };
};

const screenshot = (page, state) =>
  process.env.HH_BROWSER_IMPORT_SCREENSHOTS === '1'
    ? page.screenshot({
        path: `docs/screenshots/issue-56-hh-browser-import-${state}.png`,
      })
    : Promise.resolve();

export const verifyHhBrowserImport = async ({ page, base, native, store }) => {
  assert.equal(await store.get('secret:hh:access-token'), null);
  await page.goto(`${base}/#conn-hh`);
  const panel = page.locator('[data-provider="hh"].provider-auto-import');
  const start = panel.getByRole('button', { name: 'Open browser' });
  const capture = panel.getByRole('button', { name: 'Capture this chat' });
  await start.click();
  await page.locator('[data-auto-import-state="waiting"]').waitFor();
  if (process.env.HH_BROWSER_IMPORT_BEFORE === '1') {
    await screenshot(page, 'before');
    assert.equal(
      await capture.count(),
      1,
      'the native capture control is present'
    );
    return;
  }
  await capture.click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Open one HeadHunter conversation' })
    .waitFor();
  assert.equal(await store.get('msg:hh:web:7:101'), null);

  const provider = native();
  await provider.getByRole('link', { name: 'Example employer' }).click();
  await provider
    .getByRole('textbox', { name: 'Provider composer' })
    .fill('Unsent owner draft');
  await capture.click();
  await panel.getByText('Messages imported: 1').waitFor();
  await screenshot(page, 'after');
  assert.equal(
    await provider
      .getByRole('textbox', { name: 'Provider composer' })
      .inputValue(),
    'Unsent owner draft'
  );
  assert.equal(await provider.evaluate(() => globalThis.fixture.textSends), 0);
  assert.equal((await store.get('read:hh:web:7')).unreadCount, 2);

  await provider.goto('https://hh.ru/chat?embedded');
  await provider.frameLocator('iframe').getByText('Recruiter bot').waitFor();
  const captured = page.waitForResponse((response) =>
    response.url().endsWith('/capture')
  );
  await capture.click();
  assert.equal((await captured).status(), 200);
  await panel.getByText('Messages imported: 1').waitFor();

  await provider.goto('https://hh.ru/chat?embedded&ambiguous');
  await provider
    .frameLocator('iframe')
    .last()
    .getByText('Recruiter bot')
    .waitFor();
  await capture.click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Open one HeadHunter conversation' })
    .waitFor();
  assert.equal(await store.get('msg:hh:web:8:101'), null);
  await panel.getByRole('button', { name: 'Finish' }).click();
  await page.locator('[data-auto-import-state="done"]').waitFor();
  assert.equal(provider.isClosed(), true);

  await page.goto(`${base}/#/chat`);
  await page.locator('[data-chat="hh:web:7"]').click();
  await page
    .locator('[data-row="msg:hh:web:7:101"]')
    .getByText('Do you have distributed systems experience?')
    .waitFor();
  await screenshot(page, 'chat');
  await page.goto(`${base}/#/operator`);
  await page.locator('[data-operator-chat="hh:web:7"]').waitFor();
};
