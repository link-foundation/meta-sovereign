// Finite native layout movement between pointer-down and pointer-up.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { verifyQuestionBrowserWatch } from '../../js/tests/helpers/e2e-question-browser-watch.mjs';

const before = process.argv.includes('--before');
const screenshots = `docs/screenshots/issue-56-watch-coordinate/${before ? 'before' : 'after'}`;
await mkdir(screenshots, { recursive: true });
const browser = await webkit.launch({ headless: true });
let moved = 0;
const originalContext = browser.newContext.bind(browser);
browser.newContext = async (...args) => {
  const context = await originalContext(...args);
  context.on('page', (page) =>
    page.on('console', (message) => {
      if (message.text().startsWith('[watch-injected-layout]')) {
        moved++;
        console.log(message.text());
      }
    })
  );
  const originalPage = context.newPage.bind(context);
  context.newPage = async (...pageArgs) => {
    const page = await originalPage(...pageArgs);
    const locate = page.locator.bind(page);
    page.locator = (selector, ...rest) => {
      const locator = locate(selector, ...rest);
      if (selector === '[data-question-controls] > summary') {
        locator.click = async () => {
          await locator.scrollIntoViewIfNeeded();
          const box = await locator.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.up();
        };
      }
      return locator;
    };
    return page;
  };
  await context.addInitScript(() => {
    let changed = false;
    const move = (event) => {
      if (
        changed ||
        !event.target.matches('[data-question-controls] > summary')
      ) {
        return;
      }
      changed = true;
      const panel = event.target.parentElement;
      const beforeTop = panel.getBoundingClientRect().top;
      const spacer = document.createElement('div');
      spacer.style.height = '80px';
      panel.before(spacer);
      console.log(
        '[watch-injected-layout]',
        JSON.stringify({
          event: event.type,
          beforeTop,
          afterTop: panel.getBoundingClientRect().top,
        })
      );
    };
    globalThis.addEventListener('focusin', move, true);
  });
  return context;
};
try {
  const result = await verifyQuestionBrowserWatch(browser, {
    repeatOnly: true,
    screenshots,
  });
  assert.equal(result.cases, 1);
  assert.equal(moved, 1);
  console.log(
    JSON.stringify({ ...result, keyboardOpened: true, changedLayouts: moved })
  );
} finally {
  await browser.close();
}
