import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';
import { assertViewportFits } from './e2e-viewport.mjs';
import { decoded } from './e2e-form-review.mjs';
import { watchFixturePages } from './e2e-page-errors.mjs';

export const previewVkAutomation = async (page) => {
  const waiting = page.waitForResponse((r) =>
    r.url().endsWith('/api/automations/plan')
  );
  await page
    .locator('.automation-editor')
    .getByRole('button', { name: 'Preview', exact: true })
    .click();
  return decoded(await waiting);
};

export const saveVkAutomation = async (page) => {
  const waiting = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/automations') && r.request().method() === 'PUT'
  );
  await page
    .locator('.automation-editor')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  return decoded(await waiting);
};

// Both VK automation scenarios own their context and use synthetic sticker
// images. Keep fixture setup and viewport evidence identical across them.
export const vkAutomationBrowser = async (browser, emoji, base) => {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const errors = [];
  watchFixturePages(context, browser, base, errors);
  try {
    await context.route('https://vk.com/sticker/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><text y="95" font-size="90">${emoji}</text></svg>`,
      })
    );
    const page = await context.newPage();
    await page.addInitScript(
      ({ key, version }) => {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ off: true, v: version })
        );
        globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      },
      { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
    );
    return { context, page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
};

export const reviewVkConnection = async (browser, fixture, review) => {
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '👥', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    await view.page.goto(`${fixture.base}/#conn-vk/manual`);
    const heading = view.page.getByRole('heading', { name: 'VK', exact: true });
    await heading.waitFor();
    return await review({ ...view, heading });
  } finally {
    await context?.close();
    await fixture.close();
  }
};

export const captureVkAutomationLayouts = async (
  page,
  target,
  directory,
  prefix
) => {
  for (const phone of [false, true]) {
    await page.setViewportSize(
      phone ? { width: 390, height: 844 } : { width: 1180, height: 950 }
    );
    await target.scrollIntoViewIfNeeded();
    await assertViewportFits(page);
    if (directory) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: join(directory, `${prefix}${phone ? '-phone' : ''}.png`),
      });
    }
  }
};

/** Identical readiness and pending-state rules for reviewed personal policies. */
export const vkReviewedControls = (page, name) => {
  const panel = page.locator(`[data-vk-${name}]`);
  const ready = () =>
    page.waitForFunction((policy) => {
      const input = document.querySelector(
        `[data-action=vk-${policy}-enabled]`
      );
      return input && !input.disabled;
    }, name);
  const action = async (command) => {
    await panel.locator(`[data-action=vk-${name}-${command}]`).click();
    await ready();
  };
  const review = async (reason) => {
    await action('plan');
    assert.equal(
      await panel.locator(`[data-${name}-reason=${reason}]`).count(),
      1
    );
  };
  const deliver = async (status) => {
    await action('run');
    await panel.locator(`[data-vk-${name}-status=${status}]`).waitFor();
  };
  return { panel, ready, action, review, deliver };
};
