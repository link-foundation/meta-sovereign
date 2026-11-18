import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { hiddenLink } from './question-hidden-links-fixture.mjs';

/** Independent MCP review against an already owned, disposable fixture. */
const inspect = async (page, { base, root, destination }) => {
  page.setDefaultTimeout(15000);
  const check = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  const open = async (node) => {
    if (!(await node.evaluate((element) => element.open))) {
      await node.locator(':scope > summary').click();
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.goto(base);
  const screen = `${root}/docs/screenshots/issue-56-question-hidden-links`;
  const labels = {
    en: 'Link destinations — review before replying:',
    ru: 'Адреса ссылок — проверьте перед ответом:',
    hi: 'लिंक के पते — उत्तर देने से पहले जाँचें:',
    zh: '链接目标 — 回复前请核对：',
  };
  const locales = [];
  let controls;
  for (const [locale, label] of Object.entries(labels)) {
    await page.evaluate((value) => {
      globalThis.localStorage.setItem('metaSovereignLocale', value);
    }, locale);
    await page.goto(`${base}/?hidden-link-review=${locale}#/automation`);
    const panel = page.locator('[data-question-controls]');
    await open(panel);
    controls = panel.locator('[data-browser-answer-controls]');
    await open(controls);
    await controls.getByRole('textbox').first().fill('7');
    await controls.locator('[data-browser-answer-inspect]').click();
    const links = controls.locator('[data-question-links]');
    await links.getByText(label, { exact: true }).waitFor();
    await links.getByText(destination, { exact: true }).waitFor();
    check(
      (await links.locator('a').count()) === 0,
      'Destination became a link'
    );
    if (locale === 'en') {
      await controls
        .getByText('Review required before automatic sending.', { exact: true })
        .waitFor();
    }
    locales.push(locale);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await controls.locator('[data-question-links]').scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  check(!overflow, 'Phone overflow');
  await page.screenshot({ path: `${screen}/hidden-links-mcp-phone.png` });
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  await controls.getByText(/102/u).last().waitFor();
  await page.reload();
  const panel = page.locator('[data-question-controls]');
  await open(panel);
  controls = panel.locator('[data-browser-answer-controls]');
  await open(controls);
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  check(
    await controls.locator('[data-browser-answer-select]').isDisabled(),
    'Reload allowed replay'
  );
  check(errors.length === 0, errors.join('\n'));
  return {
    locales,
    literalDestination: destination,
    overflow,
    positiveReceipt: '102',
    reloadLocked: true,
    pageErrors: errors,
    liveProvider: false,
  };
};

export const hiddenLinksMcpCode = (base, root) =>
  mcpInspectionCode(inspect, { base, root, destination: hiddenLink.first });
