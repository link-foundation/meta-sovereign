import { assert } from './e2e-chat.mjs';

// Keep the actual service control initially below a tall highlighted section.
// The card's clearance pass must reveal it without a test click scrolling it.
export const verifyRequiredTutorialControl = async ({ page, base }) => {
  if (process.env.CI_TUTORIAL_DEBUG === '1') {
    page.on('console', (message) => {
      if (message.text().startsWith('[tutorial-clear]')) {
        console.log(message.text());
      }
    });
    await page.addInitScript(() => {
      globalThis.metaSovereignDebug = true;
    });
  }
  await page.goto(`${base}/?tutorial-control=1#/connections`);
  await page.locator('[data-tutorial-step="pick"]').waitFor();
  await page.waitForFunction(() => {
    const card = document.querySelector('.tutorial-step');
    return card && globalThis.getComputedStyle(card).visibility !== 'hidden';
  });
  // All three bounded production placement attempts have time to run.
  await page.waitForTimeout(1200);
  const geometry = await page.evaluate(() => {
    const node = document.querySelector(
      '[data-tutorial-id="connections:email"] [data-action="open-connection-detail"]'
    );
    const rect = node.getBoundingClientRect();
    const chrome = document.querySelector('.topbar').getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return {
      top: rect.top,
      bottom: rect.bottom,
      chromeBottom: chrome.bottom,
      viewportHeight: globalThis.innerHeight,
      clickable: Boolean(hit && node.contains(hit)),
      compact: document.querySelector('.tutorial-step').dataset.compact,
      scrollY: globalThis.scrollY,
    };
  });
  console.log('[tutorial-required-control]', JSON.stringify(geometry));
  if (process.env.TUTORIAL_CONTROL_SCREENSHOT) {
    await page.screenshot({ path: process.env.TUTORIAL_CONTROL_SCREENSHOT });
  }
  assert(
    geometry.top >= geometry.chromeBottom &&
      geometry.bottom <= geometry.viewportHeight &&
      geometry.clickable,
    'the required service control is visible and clickable without owner scrolling'
  );
};
