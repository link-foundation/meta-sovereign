// Real browser e2e for reduced visual effects (R-Z21): `?effects=reduced`
// or Settings -> Appearance -> "Reduce visual effects" sets
// <html data-effects="reduced"> and the frosted-glass blur is gone
// (computed backdrop-filter none on .glass and the tutorial card), "Full
// effects" brings it back, and the choice survives a reload. Fake server,
// headless browser. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:visual-effects

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const { base, page, errors, until, finish } = await openChatApp(
  'visual-effects',
  {
    store: createMemoryStore(),
  }
);

const effects = () =>
  page.evaluate(() => document.documentElement.dataset.effects);
const blur = (selector) =>
  page.evaluate((sel) => {
    const style = globalThis.getComputedStyle(document.querySelector(sel));
    return style.backdropFilter || style.webkitBackdropFilter || 'none';
  }, selector);
const choose = async (value) => {
  await page.click('button[data-view="settings"]');
  await page.click(`input[data-action="effects-mode"][value="${value}"]`);
};

// WebKit reports an event stream that a navigation cut short as an error.
const forgetCutStreams = () => {
  const kept = errors.filter((e) => !/EventSource cannot load/.test(e));
  errors.splice(0, errors.length, ...kept);
};

await finish(async () => {
  // Default on a normal machine: full effects, the glass blurs.
  await page.goto(`${base}/`);
  await page.waitForSelector('.topbar.glass', { timeout: 10000 });
  await until(async () => (await effects()) === 'full', 'full by default');
  assert((await blur('.topbar.glass')) !== 'none', 'glass blurs by default');

  // The URL forces it for the visit.
  await page.goto(`${base}/?effects=reduced`);
  forgetCutStreams();
  await page.waitForSelector('.topbar.glass', { timeout: 10000 });
  await until(async () => (await effects()) === 'reduced', 'reduced via URL');
  await until(
    async () => (await blur('.topbar.glass')) === 'none',
    'no blur on .glass'
  );

  // The Settings choice, kept across a reload.
  await page.goto(`${base}/`);
  forgetCutStreams();
  await choose('on');
  await until(async () => (await effects()) === 'reduced', 'reduced: setting');
  await until(async () => (await blur('.topbar.glass')) === 'none', 'no blur');
  await page.reload();
  await page.waitForSelector('.topbar.glass', { timeout: 10000 });
  forgetCutStreams();
  await until(async () => (await effects()) === 'reduced', 'kept on reload');

  // The tour still opens, and its card shows no blur.
  await page.click('[data-action="tutorial-open"]');
  await page.waitForSelector('.tutorial-step', { timeout: 10000 });
  assert((await blur('.tutorial-step')) === 'none', 'no blur on the card');
  await page.click('button[data-action="tutorial-off"]');
  await page.waitForSelector('.tutorial-step', { state: 'detached' });

  // Back to full effects.
  await choose('off');
  await until(async () => (await effects()) === 'full', 'full again');
  await until(
    async () => (await blur('.topbar.glass')) !== 'none',
    'blur back'
  );
});
