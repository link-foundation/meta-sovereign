/* global localStorage */
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

export const inspectCvLoading = async (page, config) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const pattern = '**/api/cv/platforms';
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.goto(config.base);
    await page.evaluate(({ key, version }) => {
      localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
      localStorage.setItem('metaSovereignLocale', 'en');
    }, config);
    await page.goto(`${config.base}/#/cv`);
    const compare = page.locator('[data-action="cv-compare"]');
    await compare.waitFor();
    const disabled = await compare.isDisabled();
    if (config.screenshot) {
      await page.screenshot({ path: config.screenshot });
    }
    if (!disabled && !config.before) {
      throw new Error('Compare must wait for the initial CV catalogue');
    }
    release();
    await page.waitForFunction(
      () => document.querySelectorAll('tr[data-platform]').length > 0
    );
    await compare.click();
    await page.locator('[data-cv-experience="compared"]').waitFor();
    return { synthetic: true, disabledDuringLoad: disabled, compared: true };
  } finally {
    release();
    await page.unroute(pattern);
  }
};
export const cvLoadingInspectionCode = (config) =>
  mcpInspectionCode(inspectCvLoading, {
    ...config,
    key: TUTORIAL_STORAGE_KEY,
    version: TUTORIAL_VERSION,
  });
