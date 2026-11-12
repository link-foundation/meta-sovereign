import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import { watchFixturePages } from './e2e-page-errors.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

/** Shared production UI fixture; native provider effects remain separately counted. */
export const questionBrowserUi = async (
  browser,
  { screenshots, group, serverOptions } = {}
) => {
  const fixture = await questionBrowserServer(browser, serverOptions);
  // Native focus is scoped to a browser context. The unread fixture must share
  // that context so the real UI tab deactivates its synthetic provider tab.
  const context = serverOptions?.unreadReview
    ? fixture.page.context()
    : await browser.newContext({ viewport: { width: 1180, height: 950 } });
  const page = await context.newPage();
  if (serverOptions?.unreadReview) {
    await page.setViewportSize({ width: 1180, height: 950 });
  }
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  await page.addInitScript(
    ({ key, version }) => {
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      );
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignOperatorScope',
        JSON.stringify({
          private: true,
          bot: true,
          group: false,
          channel: false,
        })
      );
    },
    { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
  );
  const panel = page.locator('[data-question-controls]');
  let controls = panel.locator('[data-browser-answer-controls]');
  let navigation = 0;
  let cases = 0;
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const open = async () => {
    await page.goto(
      `${fixture.base}/?browser-review=${++navigation}#/automation`
    );
    if (serverOptions?.unreadReview) {
      await page.bringToFront();
    }
    controls = panel.locator('[data-browser-answer-controls]');
    await openQuestionDisclosure(panel);
  };
  const readCurrent = async () => {
    const review = controls.locator('[data-browser-answer-review]');
    const previous = (await review.count())
      ? await review.getAttribute('data-browser-answer-review')
      : null;
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        previous
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  return {
    fixture,
    page,
    errors,
    shot,
    open,
    readCurrent,
    get controls() {
      return controls;
    },
    setControls: (value) => {
      controls = value;
    },
    inspect: async () => {
      await openQuestionDisclosure(controls);
      await controls
        .getByLabel('Web-chat reference', { exact: true })
        .fill('7');
      await readCurrent();
    },
    status: (value) =>
      controls.locator(`[data-browser-answer-status="${value}"]`),
    run: async (name, work) => {
      await work();
      cases++;
      console.log(`[${group ?? 'question-browser'}] PASS ${name}`);
    },
    result: () => {
      assert.deepEqual(errors, []);
      return { cases, pageErrors: errors, liveProvider: false };
    },
    close: async () => {
      await context.close();
      await fixture.close();
    },
  };
};
