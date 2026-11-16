/* global localStorage, innerWidth */
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { experienceDocumentToLino } from '../../js/src/cv/experience-document.js';
import { encodeWire, LINO_BINARY } from '../../js/src/transport/lino.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

export const experienceDocumentInspectionConfig = (extra) => ({
  ...extra,
  key: TUTORIAL_STORAGE_KEY,
  version: TUTORIAL_VERSION,
  files: {
    hh: experienceDocumentToLino(experienceDocumentFixture()),
    linkedin: [
      ...experienceDocumentToLino(
        experienceDocumentFixture('linkedin'),
        LINO_BINARY
      ),
    ],
  },
  refused: encodeWire({
    error: 'Synthetic import refused',
    code: 'fixture-refusal',
  }),
});
export const runExperienceDocumentActions = async (
  page,
  config,
  panel,
  capture
) => {
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const action = (name) => panel.locator(`[data-experience-action="${name}"]`);
  const choice = (platform) =>
    panel.locator(`[data-experience-choice="${platform}"]`);
  const receipt = panel.locator('[data-experience-receipt]');
  await action('reload').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-experience-action="reload"]').disabled
  );
  const exports = panel.locator('[data-experience-hh-export]');
  check(
    (await exports.count()) === 1,
    'One native export control survives loading renders'
  );
  const native = await exports
    .locator('option')
    .evaluateAll((rows) => rows.find((row) => row.value)?.value);
  check(native, 'Existing native HH receipt is listed');
  await exports.selectOption(native);
  await action('from-hh').click();
  await receipt.waitFor();
  const initial = await receipt.getAttribute('data-experience-receipt');
  const upload = async (platform) => {
    await panel.locator('[data-experience-file]').setInputFiles({
      name: `experience-${platform}.${platform === 'hh' ? 'lino' : 'bin'}`,
      mimeType: platform === 'hh' ? 'text/lino' : 'application/lino-binary',
      buffer: Buffer.from(config.files[platform]),
    });
  };
  const importFile = async (platform, previous) => {
    await upload(platform);
    await action('import').click();
    await page.waitForFunction((old) => {
      const node = document.querySelector('[data-experience-receipt]');
      return node && node.getAttribute('data-experience-receipt') !== old;
    }, previous);
  };
  await importFile('hh', initial);
  const hh = await choice('hh').inputValue();
  await upload('linkedin');
  await page.route('**/api/cv/experience/import', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/lino',
      body: config.refused,
    })
  );
  await action('import').click();
  await panel.locator('[data-experience-error]').waitFor();
  check(
    (await choice('hh').inputValue()) === hh,
    'Refused import retains HH selection'
  );
  check(
    (await choice('linkedin').inputValue()) === '',
    'Refused import cannot select an unacknowledged snapshot'
  );
  check(
    (await panel
      .locator('[data-experience-file]')
      .evaluate((node) => node.files[0].name)) === 'experience-linkedin.bin',
    'Refused import retains file'
  );
  await page.unroute('**/api/cv/experience/import');
  await action('import').click();
  await page.waitForFunction(() =>
    Boolean(document.querySelector('[data-experience-choice="linkedin"]').value)
  );
  await action('compare').click();
  await panel.locator('[data-experience-pair]').waitFor();
  await panel.scrollIntoViewIfNeeded();
  await capture('documents-after');
  let downloads = 0;
  for (const [platform, suffix] of [
    ['hh', 'lino'],
    ['linkedin', 'bin'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      action(`download-${platform}-${suffix}`).click(),
    ]);
    check(
      download.suggestedFilename().endsWith(`.${suffix}`),
      'Typed file download'
    );
    await download.delete();
    downloads++;
  }
  return { action, choice, downloads, hh };
};
export const inspectExperienceDocuments = async (
  page,
  config,
  runActions = runExperienceDocumentActions
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
  const panel = page.locator('[data-experience-documents]');
  const capture = async (name) => {
    if (config.screenshots) {
      if (!config.beforeBundle) {
        await panel.evaluate((node) => node.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => globalThis.scrollBy(0, -72));
      }
      await page.screenshot({ path: `${config.screenshots}/${name}.png` });
    }
  };
  if (config.beforeBundle) {
    await page.locator('.cv-view').waitFor();
    check(
      (await panel.count()) === 0,
      'Parent has no structured import controls'
    );
    await capture('documents-before');
    return { before: true, errors };
  }
  await panel.waitFor();
  await panel.locator('summary').first().click();
  const { action, choice, downloads, hh } = await runActions(
    page,
    config,
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
    await panel.waitFor();
    await panel.locator('summary').first().click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-experience-action="reload"]').disabled
    );
    await choice('hh').selectOption(hh);
    const linkedin = await choice('linkedin')
      .locator('option')
      .evaluateAll((rows) => rows.find((row) => row.value)?.value);
    await choice('linkedin').selectOption(linkedin);
    await action('compare').click();
    await panel.locator('[data-experience-pair]').waitFor();
    check(
      !/experienceFiles\./u.test(await panel.innerText()),
      'Locale labels resolve'
    );
    await panel.scrollIntoViewIfNeeded();
    await capture(`documents-${locale}`);
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-layout="compact"]').waitFor();
  await panel.scrollIntoViewIfNeeded();
  await capture('documents-phone');
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  check(layout.width <= layout.viewport, 'Phone has no horizontal overflow');
  check(errors.length === 0, 'No page errors');
  return {
    nativeReceiptReused: true,
    imports: ['text/lino', 'application/lino-binary'],
    refusedImportRetainsInput: true,
    downloads,
    locales,
    layout,
    errors,
  };
};
export const experienceDocumentInspectionCode = (config) =>
  mcpInspectionCode(
    inspectExperienceDocuments,
    experienceDocumentInspectionConfig(config),
    runExperienceDocumentActions
  );
