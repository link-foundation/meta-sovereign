// R-AA2: real UI, isolated server/store, no provider credentials or launches.
// Run in existing browser CI: RUN_BROWSER_E2E=1 npm run test:e2e:browser-preferences
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const { page, base, until, finish } = await openChatApp('browser-preferences', {
  store: createMemoryStore(),
});

await finish(async () => {
  await page.goto(`${base}/#settings`);
  // Dismiss the first-run tutorial without changing production onboarding.
  const off = page.getByRole('button', {
    name: 'Turn off tutorial',
    exact: true,
  });
  if (await off.isVisible()) {
    await off.click();
  }
  await page.locator('button[data-view="settings"]').click();
  const panel = page.locator('.browser-settings');
  await panel.waitFor();
  const scope = panel.locator('[data-action="browser-scope"]');
  const mode = panel.locator('[data-action="browser-mode"]');
  const save = panel.locator('[data-action="browser-save"]');
  const saved = () => panel.locator('[data-browser-status="saved"]').waitFor();
  await scope.selectOption('case');
  await panel.locator('[data-action="browser-case"]').selectOption('cv');
  await mode.selectOption('headless');
  await save.click();
  await saved();
  await page.reload();
  await scope.selectOption('case');
  await panel.locator('[data-action="browser-case"]').selectOption('cv');
  assert((await mode.inputValue()) === 'headless', 'workflow survives reload');
  await scope.selectOption('slot');
  await panel.locator('[data-field="browser-slot"]').fill('forms');
  await mode.selectOption('visible');
  await save.click();
  await saved();
  const read = async () =>
    (
      await page.request.get(
        `${base}/api/browser/policies?platform=hh&slot=forms&useCase=cv`
      )
    ).json();
  assert((await read()).resolved.headless === false, 'slot overrides workflow');
  await page.route('**/api/browser/policies', (route) =>
    route.request().method() === 'POST'
      ? fulfil(route, { error: 'fixture save failed' }, 503)
      : route.continue()
  );
  await mode.selectOption('headless');
  assert(
    (await panel.locator('[data-browser-status="saved"]').count()) === 0,
    'editing clears the saved claim'
  );
  await save.click();
  await panel.locator('[data-browser-status="failed"]').waitFor();
  assert((await mode.inputValue()) === 'headless', 'failure retains selection');
  assert(
    (await read()).resolved.headless === false,
    'failed save changes nothing'
  );
  await page.unroute('**/api/browser/policies');
  await save.click();
  await saved();
  assert((await read()).resolved.headless === true, 'retry saves selection');
  await mode.selectOption('inherit');
  await save.click();
  await saved();
  assert((await read()).resolved.scope === 'case', 'inherit restores workflow');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'mobile settings fit the viewport'
  );
  // A browser-only/mobile client must not offer a local desktop launch setting.
  await page.route('**/api/browser/policies', (route) =>
    fulfil(route, { available: false })
  );
  await page.reload();
  await until(
    async () => (await panel.count()) === 0,
    'unavailable settings hidden'
  );
});
