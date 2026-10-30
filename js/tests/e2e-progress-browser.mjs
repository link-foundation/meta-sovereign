// One small page of real rendered progress components; no archive or network.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { ProgressBar } from '../src/web/progress-bar.js';
import { cloudVars } from '../src/web/cloud-theme-model.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';
import { assertProgress } from './helpers/e2e-progress.mjs';

const { engine, browserType } = await browserOf('progress');
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
const variants = ['attach-progress-bar', 'export-bar', 'boosts-bar'];
const values = [0, 29, 68, 100, null];
const markup = variants.flatMap((className) =>
  values.map((percent) =>
    React.createElement(
      'section',
      {
        key: `${className}-${percent}`,
        'data-case': `${className}-${percent}`,
      },
      React.createElement(ProgressBar, {
        className,
        percent,
        label: percent === null ? 'Working' : `${percent}%`,
      })
    )
  )
);
let failed = false;
try {
  await page.setContent(
    renderToStaticMarkup(React.createElement('main', null, markup))
  );
  await page.addStyleTag({
    path: fileURLToPath(new URL('../src/web/app.css', import.meta.url)),
  });
  await page.addStyleTag({
    content: 'section { width: 300px; margin: 10px; }',
  });
  for (const mode of ['dark', 'light']) {
    for (const skin of ['t3', 'telegram', 'whatsapp', 'signal', 'cloud']) {
      const vars =
        skin === 'cloud'
          ? cloudVars(
              { dark: { accent: 0xffffff }, light: { accent: 0xffff00 } },
              mode === 'dark'
            )
          : {};
      await page.evaluate(
        ({ mode, skin, vars }) => {
          const root = globalThis.document.documentElement;
          root.dataset.theme = mode;
          root.dataset.skin = skin === 'cloud' ? 't3' : skin;
          root.removeAttribute('style');
          Object.entries(vars).forEach(([key, value]) =>
            root.style.setProperty(key, value)
          );
        },
        { mode, skin, vars }
      );
      for (const variant of variants) {
        for (const value of values.filter((value) => value !== null)) {
          await assertProgress(
            page.locator(`[data-case="${variant}-${value}"] .progress-track`),
            value
          );
        }
      }
    }
  }
  for (const variant of variants) {
    const bar = page.locator(`[data-case="${variant}-null"] .progress-track`);
    assert(
      (await bar.getAttribute('aria-valuenow')) === null,
      'unknown progress is not a fake measured value'
    );
    assert(
      (await bar.getAttribute('data-progress')) === 'indeterminate',
      'unknown progress has a distinct state'
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animation = await page
    .locator('[data-progress="indeterminate"] .progress-fill')
    .first()
    .evaluate((node) => globalThis.getComputedStyle(node).animationName);
  assert(
    animation === 'none',
    'indeterminate progress respects reduced motion'
  );
  console.log(
    `[e2e-progress] geometry, contrast and unknown progress OK (${engine})`
  );
} catch (error) {
  failed = true;
  console.error(`[e2e-progress] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(
      process.env.E2E_ARTIFACT_DIR || os.tmpdir(),
      `ms-e2e-progress-${engine}.png`
    ),
  });
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
