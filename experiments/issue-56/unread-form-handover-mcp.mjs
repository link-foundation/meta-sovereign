import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

const inspect = async (page, { base, control, desktop, phone }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${base}/#/automation`);
  const panel = page.locator('[data-question-controls]');
  const browser = panel.locator('[data-browser-answer-controls]');
  for (const disclosure of [panel, browser]) {
    if (!(await disclosure.evaluate((node) => node.open))) {
      await disclosure.locator(':scope > summary').click();
    }
  }
  const unread = browser.locator('[data-browser-unread-controls]');
  await unread.locator('[data-browser-unread-answers]').check();
  await unread.locator('[data-browser-unread-forms]').check();
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor({
    timeout: 65000,
  });
  const held = unread.locator('[data-browser-unread-held="9"]');
  const summary = unread.locator('[data-browser-unread-answer="form-review"]');
  const form = unread.locator('[data-browser-unread-form="prefilled"]');
  await held.waitFor();
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: desktop });
  await page.setViewportSize({ width: 390, height: 844 });
  const result = {
    summary: await summary.innerText(),
    form: await form.innerText(),
    heldChat: await held.getAttribute('data-browser-unread-held'),
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    ),
    stats: await (await page.request.get(control)).json(),
    pageErrors,
    liveProvider: false,
  };
  if (
    result.summary !== 'Answers saved from summary (2).' ||
    !result.form.includes('Prefilled fields (1)') ||
    result.overflow ||
    result.stats.draft !== 'At 9 a.m.' ||
    result.stats.sends !== 0 ||
    result.stats.visits.join(',') !== '8,9' ||
    pageErrors.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: phone });
  return result;
};

const raw = await readFile(
  'ci-logs/unread-form-handover-mcp-server.log',
  'utf8'
);
await writeFile(
  'ci-logs/unread-form-handover-mcp-code.js',
  mcpInspectionCode(inspect, {
    ...JSON.parse(raw.split('\n')[0]),
    desktop: resolve(
      'docs/screenshots/issue-56-unread-form-handover-after.png'
    ),
    phone: resolve('docs/screenshots/issue-56-unread-form-handover-phone.png'),
  })
);
