import assert from 'node:assert/strict';

export const assertCvWatchLayout = async (page, screenshot) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  if (overflow) {
    await screenshot('cv-save-watch-phone-overflow');
    if (process.env.CI_CV_WATCH_LAYOUT_DEBUG === '1') {
      console.log(
        '[cv-watch-layout]',
        await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .slice(0, 5000)
            .map((node) => ({
              tag: node.tagName,
              className: node.className,
              right: node.getBoundingClientRect().right + globalThis.scrollX,
              width: node.getBoundingClientRect().width,
              contentWidth: node.scrollWidth,
              clientWidth: node.clientWidth,
            }))
            .filter(
              (node) =>
                node.right > globalThis.innerWidth ||
                node.contentWidth > node.clientWidth + 2
            )
            .slice(0, 20)
        )
      );
    }
  }
  assert.equal(overflow, false, 'Saved CV receipts must fit a phone viewport');
};
