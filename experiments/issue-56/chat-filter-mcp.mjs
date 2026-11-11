/* global chatScanContract -- supplied by the bundled production scanner */
import { writeFile } from 'node:fs/promises';
import { mcpChatScanBundle } from './mcp-chat-scan-bundle.mjs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { hhChatScanHtml } from './hh-chat-scan-fixture.mjs';

const inspect = async (page, { ui, html, screenshot }) => {
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: html })
  );
  const results = [];
  for (const interrupted of [false, true]) {
    await page.goto(`https://hh.ru/chat?mcp-filter=${interrupted}`);
    let moved = false;
    const document = {
      evaluate: async ({ fn, args }) => {
        const result = await page.evaluate(fn, args[0]);
        if (interrupted && !moved && args[0]?.operation === 'move') {
          moved = true;
          await page.locator('#list').hover();
          await page.mouse.wheel(0, 60);
          await page.waitForTimeout(30);
        }
        return result;
      },
    };
    const result = await chatScanContract.scanBrowserChatList(
      document,
      ui,
      { unreadOnly: true, waitMs: 30, endWaitMs: 100, budgetMs: 5000 },
      { now: () => Date.now(), pause: (ms) => page.waitForTimeout(ms) }
    );
    const checked = await page.locator('#outer-filter').isChecked();
    const position = await page
      .locator('#list')
      .evaluate((node) => node.scrollTop);
    check(
      result.coverage.complete === false,
      'Provider coverage must remain incomplete'
    );
    if (interrupted) {
      check(
        result.coverage.reason === 'owner-active' &&
          !result.filter.restored &&
          checked,
        'Owner activity must preserve the current filter'
      );
    } else {
      check(
        result.rows.length === 8 && result.rows.every((row) => row.unread > 0),
        'Only actual unread rows'
      );
      check(
        result.filter.observed &&
          result.filter.restored &&
          result.restored &&
          !checked &&
          position === 300,
        'Restore the actual outer checkbox and original scroll'
      );
    }
    results.push({
      rows: result.rows.map((row) => row.chat),
      coverage: result.coverage,
      filter: result.filter,
      position,
      checked,
    });
    await page.locator('#result').evaluate((node, value) => {
      node.textContent = JSON.stringify(value, null, 2);
    }, results.at(-1));
    await page.screenshot({
      path: `${screenshot}-${interrupted ? 'owner' : 'unread'}.png`,
      fullPage: true,
    });
  }
  check(errors.length === 0, 'No browser errors');
  return {
    cases: results.length,
    results,
    pageErrors: errors,
    liveProvider: false,
  };
};

const bundle = await mcpChatScanBundle();
await writeFile(
  'ci-logs/chat-filter-mcp-code.js',
  `async (page) => {
  const process = {env: {}};
  ${bundle}
  return (${mcpInspectionCode(inspect, {
    ui: HH_WEB_UI,
    html: hhChatScanHtml({ filter: true }),
    screenshot: `${process.cwd()}/docs/screenshots/issue-56-chat-filter/mcp`,
  })})(page);
}`
);
