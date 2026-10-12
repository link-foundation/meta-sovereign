// Tutorial spotlight vs. its nav button while the nav drawer scrolls.
//
// The frame used to be positioned from getBoundingClientRect() in a
// scroll listener + requestAnimationFrame, so for one frame after every
// scroll it sat where the button *was* — the outline visibly trailed.
// It is now tied to the button with CSS anchor positioning
// (`anchor-name` / `position-anchor`), which the engine moves together
// with the scroll.
//
// Prints the distance (px) between frame and button right after a
// scroll, after one frame and after two. 0 means no trailing.
//
//   node js/bin/meta-sovereign.js serve --port=8799 --store=/tmp/ms-lag &
//   npx playwright install webkit
//   node experiments/spotlight-scroll-lag.mjs http://127.0.0.1:8799/ webkit
//
// Measured (Playwright WebKit 27.2): before 156/156/0, after 0/0/0.
// Chromium keeps reporting 156/156/0 through getBoundingClientRect:
// it applies the anchor scroll adjustment on the compositor.

import { chromium, webkit } from 'playwright';

const [base = 'http://127.0.0.1:8799/', engineName = 'webkit'] =
  process.argv.slice(2);
const engine = { chromium, webkit }[engineName];
const browser = await engine.launch();
// Short enough that the nav drawer has to scroll.
const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() =>
    globalThis.localStorage.removeItem('metaSovereignTutorial')
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tutorial-spotlight-frame');
  const result = await page.evaluate(async () => {
    const nav = document.querySelector('nav.permanent-drawer');
    const target = document.querySelector(
      '[data-tutorial-id="nav:connections"]'
    );
    const frame = document.querySelector('.tutorial-spotlight-frame');
    const delta = () => {
      const a = target.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      return Math.round(Math.abs(a.top - b.top) + Math.abs(a.left - b.left));
    };
    const nextFrame = () =>
      new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
    nav.scrollTop = nav.scrollHeight;
    const sameTask = delta();
    await nextFrame();
    const oneFrame = delta();
    await nextFrame();
    return {
      scrolledBy: nav.scrollTop,
      anchorSupport: globalThis.CSS.supports('anchor-name: --a'),
      sameTask,
      oneFrame,
      twoFrames: delta(),
    };
  });
  console.log(engineName, result);
} finally {
  await browser.close();
}
