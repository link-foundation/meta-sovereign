import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { russianThanks } from './notice-fixture.mjs';

const inspect = async (page, { base, control, screenshot, thanks }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${base}/#/automation`);
  const panel = page.locator('[data-question-controls]');
  const open = async (disclosure) => {
    if (!(await disclosure.evaluate((node) => node.open))) {
      await disclosure.locator(':scope > summary').click();
    }
  };
  await open(panel);
  const browser = panel.locator('[data-browser-answer-controls]');
  await open(browser);
  const unread = browser.locator('[data-browser-unread-controls]');
  const stats = async () => (await page.request.get(control)).json();
  const before = await stats();
  await unread.locator('[data-browser-unread-notices]').check();
  await unread.getByLabel('Maximum chats (1–100)', { exact: true }).fill('1');
  await unread.locator('[data-browser-unread-confirm]').check();
  if (before.sends || before.visits.length || (await stats()).sends) {
    throw new Error('Opening the controls must leave the provider unchanged');
  }
  await unread.locator('[data-browser-unread-start]').click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor();
  const receipt = unread.getByText('Provider message receipt: 708', {
    exact: true,
  });
  await receipt.waitFor();
  await unread.getByText(thanks, { exact: true }).waitFor();
  await receipt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshot });
  const after = await stats();
  if (
    after.sends !== 1 ||
    after.visits.length ||
    after.replies['7'] !== thanks ||
    after.draft ||
    pageErrors.length
  ) {
    throw new Error(JSON.stringify({ before, after, pageErrors }));
  }
  return { before, after, pageErrors, liveProvider: false };
};

const raw = await readFile('ci-logs/notice-selected-mcp-server.log', 'utf8');
await writeFile(
  'ci-logs/notice-selected-mcp-code.js',
  mcpInspectionCode(inspect, {
    ...JSON.parse(raw.split('\n')[0]),
    screenshot: resolve(
      'docs/screenshots/issue-56/notice-selected/receipt-phone.png'
    ),
    thanks: russianThanks,
  })
);
