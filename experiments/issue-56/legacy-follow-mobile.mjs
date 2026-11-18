// Keep responsive diagnostics on the same verified production route sequence.
import { verifyLegacyFollow } from '../../js/tests/helpers/e2e-legacy-follow.mjs';

await verifyLegacyFollow(async (page) => {
  console.log(
    'resize-immediate',
    await page.evaluate(() => ({
      width: globalThis.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')]
        .map((e) => ({
          tag: e.tagName,
          cls: e.className,
          text: e.textContent?.slice(0, 160),
          right: e.getBoundingClientRect().right,
        }))
        .filter((e) => e.right > globalThis.innerWidth + 1)
        .slice(-20),
    }))
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve)
        )
      )
  );
  console.log(
    'resize-settled',
    await page.evaluate(() => ({
      width: globalThis.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }))
  );
  await page.screenshot({ path: 'ci-logs/legacy-follow-mobile-settled.png' });
});
