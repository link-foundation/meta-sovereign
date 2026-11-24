import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

const inspect = async (page, { base, control, screenshot }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.goto(`${base}/#/automation`);
  const panel = page.locator('[data-question-controls]');
  const controls = panel.locator('[data-browser-answer-controls]');
  for (const disclosure of [panel, controls]) {
    if (!(await disclosure.evaluate((node) => node.open))) {
      await disclosure.locator(':scope > summary').click();
    }
  }
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  await controls.locator('[data-browser-answer-inspect]').click();
  await controls.locator('[data-browser-answer-review]').waitFor();
  const watch = controls.locator('[data-browser-answer-watch]');
  await watch.locator('[data-notice-watch-mode]').check();
  await watch.locator('[data-browser-watch-start]').click();
  const receipt = watch.locator('[data-browser-watch-phase="review"]');
  await receipt
    .locator('[data-notice-watch-kind="acknowledgements"]')
    .waitFor();
  await receipt
    .locator('[data-browser-pending-turn]')
    .getByText('https://example.test/next', { exact: true })
    .waitFor();
  await receipt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot });
  await watch.locator('[data-browser-watch-stop]').click();
  await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
  const stats = await (await page.request.get(control)).json();
  if (
    stats.opens !== 1 ||
    stats.sends !== 0 ||
    stats.outbox !== 0 ||
    pageErrors.length
  ) {
    throw new Error(JSON.stringify({ stats, pageErrors }));
  }
  return {
    phase: 'review',
    stopped: true,
    ...stats,
    pageErrors,
    liveProvider: false,
  };
};

const log = await readFile('ci-logs/notice-link-mcp-server.log', 'utf8');
await writeFile(
  'ci-logs/notice-link-mcp-code.js',
  mcpInspectionCode(inspect, {
    ...JSON.parse(log.split('\n')[0]),
    screenshot: resolve('docs/screenshots/issue-56-notice-link/mcp-phone.png'),
  })
);
