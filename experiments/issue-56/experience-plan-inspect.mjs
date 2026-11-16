/* global localStorage, innerWidth */
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { encodeWire } from '../../js/src/transport/lino.js';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

export const experiencePlanInspectionConfig = (extra) => ({
  ...extra,
  key: TUTORIAL_STORAGE_KEY,
  version: TUTORIAL_VERSION,
  refused: encodeWire({
    code: 'fixture-lost-response',
    error: 'Synthetic lost acknowledgement',
  }),
});
export const runExperiencePlanActions = async (
  page,
  config,
  parent,
  panel,
  capture
) => {
  const check = (value, text) => {
    if (!value) {
      throw new Error(text);
    }
  };
  const action = (name) =>
    panel.locator(`[data-experience-plan-action="${name}"]`);
  const phase = (name) =>
    panel.locator(`[data-experience-plan-state="${name}"]`);
  await parent
    .locator('[data-experience-choice="hh"]')
    .selectOption(config.input.hh);
  await parent
    .locator('[data-experience-choice="linkedin"]')
    .selectOption(config.input.linkedin);
  let starts = 0;
  await page.route('**/api/cv/experience/plan-start', async (route) => {
    starts++;
    const response = await route.fetch();
    check(response.ok(), 'The real fixture server acknowledged Start');
    await route.fulfill({
      status: 503,
      contentType: 'text/lino',
      body: config.refused,
    });
  });
  const id = await panel.locator('[data-experience-plan-request]').inputValue();
  await action('start').click();
  await phase('completed').waitFor();
  check(starts === 1, 'Lost acknowledgement recovery cannot replay Start');
  check(
    (await parent.locator('[data-experience-choice="hh"]').inputValue()) ===
      config.input.hh,
    'HH selection retained'
  );
  check(
    (await parent
      .locator('[data-experience-choice="linkedin"]')
      .inputValue()) === config.input.linkedin,
    'LinkedIn selection retained'
  );
  check(
    (await panel.locator('[data-experience-plan-kind="keep"]').count()) === 1,
    'Target-only job is kept'
  );
  check(
    (await panel.locator('[data-cv-translation-variant="formal-ai"]').count()) >
      0,
    'Formal AI refusals remain visible'
  );
  await capture('plan-after');
  await panel
    .locator('[data-cv-translation-result]')
    .first()
    .scrollIntoViewIfNeeded();
  if (config.screenshots) {
    await page.screenshot({
      path: `${config.screenshots}/plan-translations.png`,
    });
  }
  let downloads = 0;
  for (const kind of ['text', 'binary']) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      action(kind).click(),
    ]);
    check(
      download.suggestedFilename().startsWith(`experience-plan-${id}.`),
      'Private plan download has the acknowledged request ID'
    );
    await download.delete();
    downloads++;
  }
  await page.unroute('**/api/cv/experience/plan-start');
  await action('new').click();
  await panel.locator('[data-experience-plan-to]').selectOption('hh');
  await action('start').click();
  await phase('translating').waitFor();
  await action('stop').click();
  await phase('stopped').waitFor();
  await capture('plan-stopped');
  await action('new').click();
  await panel.locator('[data-experience-plan-request]').fill(id);
  await action('status').click();
  await phase('completed').waitFor();
  return { id, starts, downloads };
};
export const inspectExperiencePlan = async (
  page,
  config,
  actions = runExperiencePlanActions
) => {
  const check = (value, text) => {
    if (!value) {
      throw new Error(text);
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.unroute('**/app.min.js');
  if (config.beforeBundle) {
    await page.route('**/app.min.js', (route) =>
      route.fulfill({
        path: config.beforeBundle,
        contentType: 'text/javascript',
      })
    );
  }
  await page.goto(config.base);
  await page.evaluate(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
    localStorage.setItem('metaSovereignLocale', 'en');
    localStorage.removeItem('meta-sovereign:experience-plan');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  const parent = page.locator('[data-experience-documents]');
  await parent.waitFor();
  await parent.locator('summary').first().click();
  await page.waitForFunction(
    () => !document.querySelector('[data-experience-action="reload"]').disabled
  );
  const panel = page.locator('[data-experience-plan]');
  const capture = async (name) => {
    await (config.beforeBundle ? parent : panel).evaluate((node) =>
      node.scrollIntoView({ block: 'start' })
    );
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (config.screenshots) {
      await page.screenshot({ path: `${config.screenshots}/${name}.png` });
    }
  };
  if (config.beforeBundle) {
    check(
      (await panel.count()) === 0,
      'The published parent has no directed planning controls'
    );
    await capture('plan-before');
    return { before: true, errors };
  }
  await panel.waitFor();
  const result = await actions(page, config, parent, panel, capture);
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await parent.waitFor();
    await parent.locator('summary').first().click();
    await panel.locator('[data-experience-plan-state="completed"]').waitFor();
    check(
      !/experiencePlan\./u.test(await panel.innerText()),
      'All localized labels resolve'
    );
    check(
      (await panel.locator('[data-experience-plan-request]').inputValue()) ===
        result.id,
      'Reload recovered the acknowledged request'
    );
    await capture(`plan-${locale}`);
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-layout="compact"]').waitFor();
  await capture('plan-phone');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  check(
    layout.width <= layout.viewport,
    `No horizontal overflow on a phone: ${JSON.stringify(layout)}`
  );
  check(errors.length === 0, 'No browser errors');
  return {
    synthetic: true,
    ...result,
    restoredWithoutReplay: true,
    stoppedOwnedJob: true,
    locales,
    layout,
    errors,
  };
};
export const experiencePlanInspectionCode = (config) =>
  mcpInspectionCode(
    inspectExperiencePlan,
    experiencePlanInspectionConfig(config),
    runExperiencePlanActions
  );
