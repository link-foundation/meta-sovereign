import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

const inspect = async (page, { base, control, phone }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  const policy = panel.locator('[data-answer-policy]');
  const open = async (disclosure) => {
    if (!(await disclosure.evaluate((node) => node.open))) {
      await disclosure.locator(':scope > summary').click();
    }
  };
  await open(panel);
  await open(policy);
  const add = policy.getByRole('button', { name: 'Add override', exact: true });
  await add.click();
  const scope = policy.locator('[data-notice-override]');
  await scope.getByLabel('Provider ID', { exact: true }).fill('hh');
  await scope
    .getByLabel('Chat ID (leave empty for the whole provider)', { exact: true })
    .fill('8');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  await scope.scrollIntoViewIfNeeded();
  await page.screenshot({ path: phone });
  const initial = await (await page.request.get(control)).json();
  const browser = panel.locator('[data-browser-answer-controls]');
  await open(browser);
  const unread = browser.locator('[data-browser-unread-controls]');
  await unread.locator('[data-browser-unread-notices]').check();
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await unread
    .locator('[data-browser-unread-result="completed"]')
    .waitFor({ timeout: 65000 });
  const result = {
    notices: await unread
      .locator('[data-browser-unread-notice]')
      .evaluateAll((rows) =>
        rows.map((row) => row.dataset.browserUnreadNotice)
      ),
    stats: await (await page.request.get(control)).json(),
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    ),
    errors,
    liveProvider: false,
  };
  if (
    initial.sends ||
    initial.visits.length ||
    result.notices.join(',') !== 'review,sent' ||
    result.stats.visits.join(',') !== '8,9' ||
    result.stats.sends !== 1 ||
    result.stats.replies['9'] !== 'May I ask why?' ||
    Object.hasOwn(result.stats.replies, '8') ||
    result.stats.draft !== initial.draft ||
    result.overflow ||
    errors.length
  ) {
    throw new Error(JSON.stringify({ initial, result }));
  }
  return result;
};

const raw = await readFile(
  'ci-logs/notice-policy-scopes-mcp-server.log',
  'utf8'
);
await writeFile(
  'ci-logs/notice-policy-scopes-mcp-code.js',
  mcpInspectionCode(inspect, {
    ...JSON.parse(raw.split('\n')[0]),
    phone: resolve(
      'docs/screenshots/issue-56-notice-policy-scopes-settings-phone.png'
    ),
  })
);
