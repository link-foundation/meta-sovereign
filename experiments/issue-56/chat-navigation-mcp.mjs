/* global Event, chatScanContract -- bundled production modules */
import { writeFile } from 'node:fs/promises';
import { mcpChatScanBundle } from './mcp-chat-scan-bundle.mjs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { chatNavigationHtml } from './chat-navigation-fixture.mjs';

const verifyRepeatedMcp = async ({
  commander,
  page,
  other,
  snapshot,
  original,
  result,
  check,
}) => {
  const second = await chatScanContract.scanUnreadBrowserConversations({
    commander,
    page,
    ui: chatScanContract.HH_WEB_UI,
    scanList: chatScanContract.scanBrowserChatList,
    waitMs: 150,
    endWaitMs: 100,
    budgetMs: 30000,
    maxChats: 1,
  });
  check(
    second.conversations[0]?.chat === '9',
    'Read the next unread conversation'
  );
  check(
    second.restoration.restored &&
      second.restoration.history.reusedOwnedForward,
    'Reuse only witnessed automation entries'
  );
  check(
    second.restoration.history.lengthAfter ===
      result.restoration.history.lengthAfter,
    'Repeated pass does not keep growing history'
  );
  check(
    JSON.stringify(await snapshot()) === JSON.stringify(original),
    'Second exact original view'
  );
  await page.bringToFront();
  await other.bringToFront();
  let refusal;
  try {
    await chatScanContract.scanUnreadBrowserConversations({
      commander,
      page,
      ui: chatScanContract.HH_WEB_UI,
      scanList: chatScanContract.scanBrowserChatList,
      waitMs: 150,
      endWaitMs: 100,
      budgetMs: 30000,
    });
  } catch (error) {
    refusal = error.code;
  }
  check(
    refusal === 'browser-chat-view-history-forward',
    'Returning owner permanently revokes reuse'
  );
  check(
    JSON.stringify(await snapshot()) === JSON.stringify(original),
    'Refusal preserves the current view'
  );
  return second.restoration;
};

const releaseRevealMcp = async (page, input, value, touched) => {
  if (
    touched ||
    input?.operation !== 'locate' ||
    input.chat !== '9' ||
    value.found !== false
  ) {
    return touched;
  }
  await page.evaluate(() => {
    const list = document.querySelector('#list');
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
  });
  return true;
};

const verifyUnreadMcpResult = (result, reveal, released, check) => {
  check(
    result.conversations.length === (reveal ? 2 : 1) &&
      result.conversations[0].chat === '8',
    'Expected unread chats'
  );
  check(
    !reveal || (released && result.conversations[1].chat === '9'),
    'Settled virtual render is readable'
  );
  check(
    result.conversations[0].history.coverage.complete,
    'Full fixture conversation'
  );
  check(
    result.restoration.restored && !result.coverage.complete,
    'Restore with partial provider coverage'
  );
};

const inspect = async (page, { html, screenshot, repeat, reveal }) => {
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
    let released = false;
    let touched = false,
      result;
    try {
      await other.bringToFront();
      const commander = {
        evaluate: async ({ fn, args = [] }) => {
          const value = await page.evaluate(fn, args[0]);
          if (reveal) {
            released = await releaseRevealMcp(page, args[0], value, released);
          }
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
          maxChats: reveal ? 2 : 1,
        });
        check(!ownerReturns, 'Owner return must interrupt');
        verifyUnreadMcpResult(result, reveal, released, check);
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
      const repeated =
        repeat && !ownerReturns
          ? await verifyRepeatedMcp({
              commander,
              page,
              other,
              snapshot,
              original,
              result,
              check,
            })
          : undefined;
      const receipt = {
        ownerReturns,
        revealReleased: released,
        coverage: result.coverage,
        restoration: result.restoration,
        ...(repeated ? { repeated } : {}),
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
const repeat = process.argv.includes('--repeat');
const reveal = process.argv.includes('--reveal');
const prefix = reveal
  ? 'unread-reveal'
  : repeat
    ? 'chat-repetition'
    : 'chat-navigation';
await writeFile(
  `ci-logs/${prefix}-mcp-code.js`,
  `async (page) => {
 const process={env:{}};
 const globalThis={performance:{now:()=>Date.now()}};
 const mcpPause=(ms)=>page.waitForTimeout(ms);
 ${bundle}
 const releaseRevealMcp = (${releaseRevealMcp.toString()});
 const verifyUnreadMcpResult = (${verifyUnreadMcpResult.toString()});
 const verifyRepeatedMcp = (${verifyRepeatedMcp.toString()});
 return (${mcpInspectionCode(inspect, { html: chatNavigationHtml({ virtual: reveal }), repeat, reveal, screenshot: `${process.cwd()}/docs/screenshots/issue-56-${prefix}/mcp` })})(page);
}`
);
