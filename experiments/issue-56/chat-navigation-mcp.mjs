/* global chatScanContract -- bundled production modules */
import { writeFile } from 'node:fs/promises';
import { mcpChatScanBundle } from './mcp-chat-scan-bundle.mjs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { chatNavigationHtml } from './chat-navigation-fixture.mjs';

const inspect = async (page, { html, screenshot }) => {
  const check = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route('https://hh.ru/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html })
  );
  const results = [];
  for (const ownerReturns of [false, true]) {
    await page.goto(`https://hh.ru/chat/7?mcp-owner=${ownerReturns}#reading`);
    const snapshot = () =>
      page.evaluate(() => {
        const field = document.querySelector('textarea');
        return {
          url: window.location.href,
          draft: field.value,
          selection: [
            field.selectionStart,
            field.selectionEnd,
            field.selectionDirection,
          ],
          draftTop: field.scrollTop,
          listTop: document.querySelector('#list').scrollTop,
          messageTop: document.querySelector('#history').scrollTop,
          filter: document.querySelector('#outer-filter').checked,
          sends: window.fixture.sends,
          live: Boolean(
            window[Symbol.for('meta-sovereign.browser-chat-view.v1')] ||
            window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]
          ),
        };
      });
    const original = await snapshot();
    const other = await page.context().newPage();
    let touched = false,
      result;
    try {
      await other.bringToFront();
      const commander = {
        evaluate: async ({ fn, args = [] }) => {
          const value = await page.evaluate(fn, args[0]);
          if (ownerReturns && !touched && args[0]?.operation === 'history') {
            touched = true;
            await page.bringToFront();
            await page.locator('textarea').fill('Owner returned draft');
          }
          return value;
        },
      };
      try {
        result = await chatScanContract.scanUnreadBrowserConversations({
          commander,
          page,
          ui: chatScanContract.HH_WEB_UI,
          scanList: chatScanContract.scanBrowserChatList,
          waitMs: 150,
          endWaitMs: 100,
          budgetMs: 30000,
          maxChats: 1,
        });
        check(!ownerReturns, 'Owner return must interrupt');
        check(
          result.conversations.length === 1 &&
            result.conversations[0].chat === '8',
          'Exactly one unread chat'
        );
        check(
          result.conversations[0].history.coverage.complete,
          'Full fixture conversation'
        );
        check(
          result.restoration.restored && !result.coverage.complete,
          'Restore with partial provider coverage'
        );
        check(
          JSON.stringify(await snapshot()) === JSON.stringify(original),
          'Exact original view'
        );
      } catch (error) {
        if (!ownerReturns) {
          throw error;
        }
        check(
          error.restoration?.restored === false,
          'No restore after owner return'
        );
        const current = await snapshot();
        check(
          current.url === 'https://hh.ru/chat/8' &&
            current.draft === 'Owner returned draft' &&
            current.sends === 0 &&
            !current.live,
          'Preserve owner view'
        );
        result = { interrupted: true, restoration: error.restoration };
      }
      const receipt = {
        ownerReturns,
        coverage: result.coverage,
        restoration: result.restoration,
        state: await snapshot(),
      };
      results.push(receipt);
      await page.locator('#result').evaluate((node, value) => {
        node.textContent = JSON.stringify(value, null, 2);
      }, receipt);
      await page.screenshot({
        path: `${screenshot}-${ownerReturns ? 'owner' : 'restored'}.png`,
        fullPage: true,
      });
    } finally {
      await other.close();
    }
  }
  check(errors.length === 0, 'No browser errors');
  return {
    cases: results.length,
    results,
    pageErrors: errors,
    liveProvider: false,
  };
};
const bundle = await mcpChatScanBundle({ unread: true });
await writeFile(
  'ci-logs/chat-navigation-mcp-code.js',
  `async (page) => {
 const process={env:{}};
 const globalThis={performance:{now:()=>Date.now()}};
 const mcpPause=(ms)=>page.waitForTimeout(ms);
 ${bundle}
 return (${mcpInspectionCode(inspect, { html: chatNavigationHtml(), screenshot: `${process.cwd()}/docs/screenshots/issue-56-chat-navigation/mcp` })})(page);
}`
);
