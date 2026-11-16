/* global localStorage, innerWidth */
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { encodeWire } from '../../js/src/transport/lino.js';

export const linkedinInspectionConfig = (extra) => ({
  ...extra,
  key: TUTORIAL_STORAGE_KEY,
  version: TUTORIAL_VERSION,
  url: 'https://www.linkedin.com/in/fixture-owner/details/experience/',
  refused: encodeWire({
    code: 'fixture-lost-response',
    error: 'Synthetic lost acknowledgement',
  }),
});
export const runLinkedinExperienceActions = async (
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
  let starts = 0;
  const action = (name) =>
    panel.locator(`[data-linkedin-experience-action="${name}"]`);
  const field = (name) =>
    panel.locator(`[data-linkedin-experience-field="${name}"]`);
  const phase = (name) =>
    panel.locator(`[data-linkedin-experience-phase="${name}"]`);
  const choice = (platform) =>
    parent.locator(`[data-experience-choice="${platform}"]`);
  await page.waitForFunction(
    () => !document.querySelector('[data-experience-action="reload"]').disabled
  );
  const native = parent.locator('[data-experience-hh-export]');
  await native.selectOption(
    await native
      .locator('option')
      .evaluateAll((rows) => rows.find((row) => row.value).value)
  );
  await parent.locator('[data-experience-action="from-hh"]').click();
  await parent.locator('[data-experience-receipt]').waitFor();
  const hh = await choice('hh').inputValue();
  await field('url').fill(config.url);
  const requestId = await field('requestId').inputValue();
  await page.route('**/api/cv/experience/linkedin-start', async (route) => {
    starts++;
    const response = await route.fetch();
    check(response.ok(), 'Native start reached the real fixture server');
    await route.fulfill({
      status: 503,
      contentType: 'text/lino',
      body: config.refused,
    });
  });
  await action('start').click();
  await phase('completed').waitFor();
  check(
    starts === 1,
    'Lost acknowledgement recovery uses GET without replaying Start'
  );
  check(
    (await choice('linkedin').inputValue()) === '',
    'Export completion cannot replace the active selection'
  );
  check(
    (await choice('hh').inputValue()) === hh,
    'HH selection survives export recovery'
  );
  check((await field('url').inputValue()) === config.url, 'URL is retained');
  check(
    (await field('requestId').inputValue()) === requestId,
    'Request ID is retained'
  );
  await action('select').click();
  await page.waitForFunction(() =>
    Boolean(document.querySelector('[data-experience-choice="linkedin"]').value)
  );
  const revision = await choice('linkedin').inputValue();
  await capture('linkedin-after');
  let downloads = 0;
  for (const suffix of ['txt', 'json']) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      action(`evidence-${suffix}`).click(),
    ]);
    check(
      download.suggestedFilename() === `linkedin-experience.${suffix}`,
      'Acknowledged native evidence download'
    );
    await download.delete();
    downloads++;
  }
  await page.unroute('**/api/cv/experience/linkedin-start');
  await action('new').click();
  await action('start').click();
  await phase('waiting-login').waitFor();
  await capture('linkedin-login');
  await action('stop').click();
  await phase('stopped').waitFor();
  check(
    (await choice('linkedin').inputValue()) === revision,
    'Stop retains the selected snapshot'
  );
  return { requestId, downloads };
};
export const inspectLinkedinExperience = async (
  page,
  config,
  runActions = runLinkedinExperienceActions
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
  await page.evaluate(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
    localStorage.setItem('metaSovereignLocale', 'en');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  const parent = page.locator('[data-experience-documents]');
  await parent.waitFor();
  await parent.locator('summary').first().click();
  const panel = page.locator('[data-linkedin-experience]');
  const capture = async (name) => {
    const target = config.beforeBundle ? parent : panel;
    await target.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (config.screenshots) {
      await page.screenshot({ path: `${config.screenshots}/${name}.png` });
    }
  };
  if (config.beforeBundle) {
    check(
      (await panel.count()) === 0,
      'Published parent has no native LinkedIn controls'
    );
    await capture('linkedin-before');
    return { before: true, errors };
  }
  await panel.waitFor();
  const { requestId, downloads } = await runActions(
    page,
    config,
    parent,
    panel,
    capture
  );
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await parent.waitFor();
    await parent.locator('summary').first().click();
    await panel.waitFor();
    await panel
      .locator('[data-linkedin-experience-field="requestId"]')
      .fill(requestId);
    await panel.locator('[data-linkedin-experience-action="status"]').click();
    await panel
      .locator('[data-linkedin-experience-phase="completed"]')
      .waitFor();
    check(
      !/linkedinExperience\./u.test(await panel.innerText()),
      'All locale labels resolve'
    );
    await capture(`linkedin-${locale}`);
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-layout="compact"]').waitFor();
  await capture('linkedin-phone');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  check(layout.width <= layout.viewport, 'Phone has no horizontal overflow');
  check(errors.length === 0, 'No page errors');
  return {
    synthetic: true,
    lostAcknowledgementRecoveredWithoutReplay: true,
    explicitSelection: true,
    stopDuringLogin: true,
    downloads,
    locales,
    layout,
    errors,
  };
};
export const linkedinExperienceInspectionCode = (config) =>
  mcpInspectionCode(
    inspectLinkedinExperience,
    linkedinInspectionConfig(config),
    runLinkedinExperienceActions
  );
