import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { encodeWire } from '../../js/src/transport/lino.js';

export const experienceAutoInspectionConfig = (config) => ({
  ...config,
  tutorialKey: TUTORIAL_STORAGE_KEY,
  version: TUTORIAL_VERSION,
  lostReply: encodeWire({
    code: 'fixture-lost-start',
    error: 'Synthetic lost acknowledgement',
  }),
});

export const inspectExperienceAuto = async (page, config) => {
  const confirm = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const panel = page.locator('[data-experience-plan]');
  const auto = page.locator('[data-experience-auto]');
  const field = (name) =>
    auto.locator(`[data-experience-auto-field="${name}"]`);
  const action = (name) =>
    auto.locator(`[data-experience-auto-action="${name}"]`);
  const showExperience = async () => {
    const parent = page.locator('[data-experience-documents]');
    await parent.locator('summary').first().click();
    await panel.waitFor();
  };
  const capture = async (name, locator) => {
    if (config.screenshots) {
      await locator.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => globalThis.scrollBy(0, -76));
      await page.screenshot({ path: `${config.screenshots}/${name}.png` });
    }
  };
  await page.setViewportSize({ width: 1180, height: 950 });
  if (config.beforeBundle) {
    await page.route('**/app.min.js', (route) =>
      route.fulfill({
        path: config.beforeBundle,
        contentType: 'application/javascript',
      })
    );
  }
  await page.goto(config.base);
  await page.evaluate(({ tutorialKey, version }) => {
    globalThis.localStorage.setItem(
      tutorialKey,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.removeItem('ms.cv.experience-auto');
    globalThis.localStorage.removeItem('meta-sovereign:experience-plan');
  }, config);
  await page.goto(`${config.base}/#/cv`);
  await showExperience();
  if (config.beforeBundle) {
    await capture('before', panel);
  }
  confirm(
    (await auto.count()) === 1,
    'One action can acquire and compare both profiles.'
  );
  await auto.locator('summary').click();
  await field('url').fill(config.input.url);
  await field('language').selectOption(config.input.language);
  await field('hash').fill(config.input.hash);
  const requestId = await field('requestId').inputValue();
  await capture('after', auto);

  let starts = 0;
  const startPath = '**/api/cv/experience/auto-start';
  await page.route(startPath, async (route) => {
    starts++;
    const response = await route.fetch();
    confirm(response.ok(), 'The fixture received the automatic Start.');
    await route.fulfill({
      status: 503,
      contentType: 'text/lino',
      body: config.lostReply,
    });
  });
  const lost = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/cv/experience/auto-start') &&
      response.status() === 503
  );
  await action('start').click();
  await lost;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await showExperience();
  await auto.locator('summary').click();
  await auto.locator('[data-experience-auto-phase="completed"]').waitFor();
  confirm(starts === 1, 'Reload recovered one request using GET.');
  confirm(
    (await field('requestId').inputValue()) === requestId,
    'The original request ID was retained.'
  );
  await capture('recovered-phone', auto);

  const planReply = page.waitForResponse(
    (response) =>
      response.url().includes('/api/cv/experience/plan-status?') &&
      response.ok()
  );
  await action('open').click();
  const revision = new URL((await planReply).url()).searchParams.get(
    'requestId'
  );
  await panel.locator('[data-experience-plan-state="completed"]').waitFor();
  confirm(
    (await panel.locator('[data-experience-plan-request]').inputValue()) ===
      revision,
    'The exact stored comparison opened in the existing review panel.'
  );
  confirm(
    await panel
      .locator('[data-experience-plan-state="completed"]')
      .evaluate((node) => node === node.ownerDocument.activeElement),
    'Opening the comparison focuses its review status.'
  );
  const widths = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    page: globalThis.document.documentElement.scrollWidth,
  }));
  confirm(
    widths.page <= widths.viewport + 1,
    'The comparison fits the phone viewport.'
  );
  await capture(
    'comparison-phone',
    panel.locator('[data-experience-plan-state="completed"]')
  );
  return { starts, widths };
};
