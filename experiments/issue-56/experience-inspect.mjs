/* global localStorage, innerWidth */
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

export const inspectExperience = async (page, config) => {
  const check = (condition, message) => {
    if (!condition) {
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
  for (const id of ['hh', 'linkedin']) {
    await page.locator(`tr[data-platform="${id}"] input`).check();
  }
  await page.locator('[data-action="cv-compare"]').click();
  const section = page.locator('[data-cv-experience]');
  // Waiting for the generic matrix proves the compare response was rendered.
  await page.locator('[data-path*="experience["]').first().waitFor();
  const capture = async (name) => {
    if (config.screenshots) {
      if (!config.beforeBundle) {
        await section.evaluate((node) =>
          node.scrollIntoView({ block: 'start' })
        );
        await page.evaluate(() => globalThis.scrollBy(0, -72));
      }
      await page.screenshot({ path: `${config.screenshots}/${name}.png` });
    }
  };
  if (config.beforeBundle) {
    check(
      (await section.count()) === 0,
      'Parent must lack the employer/time comparison'
    );
    await capture('experience-before');
    return { before: true, errors };
  }
  await section.waitFor();
  check(
    (await section.getAttribute('data-cv-experience')) === 'compared',
    'Compared status'
  );
  check(
    (await section.locator('[data-experience-pair]').count()) === 1,
    'Translated roles paired'
  );
  check(
    (await section.locator('[data-experience-review="ambiguous"]').count()) ===
      3,
    'Concurrent roles retained'
  );
  check(
    (await section
      .locator('[data-experience-review="unknown-period"]')
      .count()) === 2,
    'Missing dates retained'
  );
  check(
    (await section.locator('button').count()) === 0,
    'Comparison cannot authorize a provider write'
  );
  await section.scrollIntoViewIfNeeded();
  await capture('experience-after');
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await page.locator('[data-action="cv-compare"]').click();
    await section.waitFor();
    check(
      !/cvExperience\./u.test(await section.innerText()),
      `${locale}: translated labels`
    );
    await section.scrollIntoViewIfNeeded();
    await capture(`experience-${locale}`);
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  await capture('experience-phone');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  check(layout.width <= layout.viewport, 'Phone must not scroll horizontally');
  check(errors.length === 0, `Page errors: ${errors.join(', ')}`);
  return { pairs: 1, ambiguous: 3, incomplete: 2, locales, layout, errors };
};

export const experienceInspectionCode = (config) =>
  mcpInspectionCode(inspectExperience, {
    ...config,
    key: TUTORIAL_STORAGE_KEY,
    version: TUTORIAL_VERSION,
  });
