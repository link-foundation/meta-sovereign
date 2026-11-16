/* global localStorage, innerWidth */
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { encodeWire } from '../../js/src/transport/lino.js';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

export const formalReportInspectionConfig = (extra) => ({
  ...extra,
  key: TUTORIAL_STORAGE_KEY,
  version: TUTORIAL_VERSION,
  refused: encodeWire({
    error: 'Synthetic lost acknowledgement',
    code: 'fixture-lost-response',
  }),
});
export const runFormalReportActions = async (
  page,
  config,
  parent,
  panel,
  capture
) => {
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  await panel.waitFor();
  await panel.locator('summary').first().click();
  await panel.locator('[data-formal-report-preview]').waitFor();
  const mode = panel.locator('[data-formal-report-mode]');
  const action = (name) =>
    panel.locator(`[data-formal-report-action="${name}"]`);
  const phase = (name) => panel.locator(`[data-formal-report-state="${name}"]`);
  check((await mode.inputValue()) === 'dry-run', 'Reports default to dry run');
  await mode.selectOption('publish');
  check(
    await action('start').isDisabled(),
    'Publication requires explicit consent'
  );
  await capture('review');
  await mode.selectOption('dry-run');
  let starts = 0;
  await page.route('**/api/cv/experience/report-start', async (route) => {
    starts++;
    const response = await route.fetch();
    check(response.ok(), 'Fixture server acknowledged the report request');
    await route.fulfill({
      status: 503,
      contentType: 'text/lino',
      body: config.refused,
    });
  });
  await action('start').click();
  await phase('completed').waitFor();
  check(starts === 1, 'Lost response recovery uses status without replay');
  await capture('dry-run');
  await page.unroute('**/api/cv/experience/report-start');
  await action('new').click();
  await mode.selectOption('publish');
  await panel.locator('[data-formal-report-confirm]').check();
  await action('start').click();
  await phase('completed').waitFor();
  await panel
    .locator('a[href="https://github.com/link-assistant/formal-ai/issues/101"]')
    .waitFor();
  const id = await panel.locator('[data-formal-report-request]').inputValue();
  await capture('after');
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await parent.locator('summary').first().click();
    await panel.waitFor();
    await panel.locator('summary').first().click();
    await phase('completed').waitFor();
    check(
      !/formalReport\./u.test(await panel.innerText()),
      'All report labels resolve'
    );
    check(
      (await panel.locator('[data-formal-report-request]').inputValue()) === id,
      'Reload recovers the acknowledged report'
    );
    check(
      !(await panel.locator('[data-formal-report-confirm]').isChecked()),
      'Reload never reuses publication consent'
    );
    await capture(locale);
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-layout="compact"]').waitFor();
  await capture('phone');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  check(
    layout.width <= layout.viewport,
    `Phone overflow: ${JSON.stringify(layout)}`
  );
  await action('new').click();
  await mode.selectOption('dry-run');
  await panel.locator('[data-formal-report-request]').fill('hold-report');
  await action('start').click();
  await phase('preparing').waitFor();
  await action('stop').click();
  await phase('stopped').waitFor();
  return {
    synthetic: true,
    starts,
    recoveredWithoutReplay: true,
    consentRequired: true,
    stoppedOwnedSearch: true,
    locales,
    layout,
  };
};
export const inspectFormalReport = async (
  page,
  config,
  actions = runFormalReportActions
) => {
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
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
  await page.evaluate(({ key, version, planRequestId }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
    localStorage.setItem('metaSovereignLocale', 'en');
    localStorage.setItem('meta-sovereign:experience-plan', planRequestId);
    localStorage.removeItem('meta-sovereign:formal-report');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  const parent = page.locator('[data-experience-documents]');
  await parent.waitFor();
  await parent.locator('summary').first().click();
  const plan = page.locator('[data-experience-plan]');
  await plan.locator('[data-experience-plan-state="completed"]').waitFor();
  const panel = page.locator('[data-formal-report]');
  const capture = async (name) => {
    await (config.beforeBundle ? plan : panel).evaluate((node) =>
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
      'The published parent has no reviewed Formal AI reports'
    );
    await capture('before');
    return { before: true, errors };
  }
  check(
    !/cvExperience\./u.test(await plan.innerText()),
    'All planned field labels resolve'
  );
  if (config.screenshots) {
    await plan.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    await page.screenshot({ path: `${config.screenshots}/role-after.png` });
  }
  const result = await actions(page, config, parent, panel, capture);
  check(errors.length === 0, 'No browser errors');
  return { ...result, errors };
};
export const formalReportInspectionCode = (config) =>
  mcpInspectionCode(
    inspectFormalReport,
    formalReportInspectionConfig(config),
    runFormalReportActions
  );
