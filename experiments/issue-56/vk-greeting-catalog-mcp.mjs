import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspect = async (page, data) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route('https://vk.com/sticker/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="48" font-size="48">👋</text></svg>',
    })
  );
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) {
      globalThis.localStorage.setItem(key, value);
    }
  }, data.storage);
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(data.base);
  const results = [];
  for (const [locale, label] of Object.entries(data.labels)) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.goto(`${data.base}/?greeting-catalog=${locale}#/greetings`);
    await page.locator('[data-action="collection-add"]:enabled').waitFor();
    await page.locator('[data-greeting-presets] summary').click();
    const editor = page.locator('textarea[data-field="texts"]');
    await editor.waitFor();
    if (!(await editor.locator('..').textContent()).includes(label)) {
      throw Error(`Missing ${locale} label`);
    }
    if (locale === 'en') {
      await editor.fill(data.texts.join('\n'));
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/greetings/selection') &&
          r.request().method() === 'PUT'
      );
      await page.locator('[data-action="greetings-save"]').click();
      if ((await response).status() !== 200) {
        throw Error('Save failed');
      }
    } else if ((await editor.inputValue()) !== data.texts.join('\n')) {
      throw Error('Catalog did not survive navigation');
    }
    await page.locator('[data-field="mode"]').selectOption('reply');
    const response = page.waitForResponse((r) =>
      r.url().endsWith('/api/greetings/plan')
    );
    await page.locator('[data-action="greetings-preview"]').click();
    if ((await response).status() !== 200) {
      throw Error('Preview failed');
    }
    await page.locator('.greetings-plan').waitFor();
    const ready = await page
      .locator('.greetings-plan tr[data-chat][data-skipped=""]')
      .evaluateAll((rows) => rows.map((row) => row.dataset.chat).sort());
    if (JSON.stringify(ready) !== JSON.stringify(['vk:41', 'vk:42'])) {
      throw Error(`Unsafe preview ${ready}`);
    }
    if (locale === 'en') {
      await page.setViewportSize({ width: 390, height: 844 });
      await editor.scrollIntoViewIfNeeded();
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ))
      ) {
        throw Error('Phone overflow');
      }
      await page.screenshot({
        path: `${data.root}/docs/screenshots/issue-56-vk-greeting-catalog/mcp-phone.png`,
      });
      await page.setViewportSize({ width: 1180, height: 950 });
    }
    results.push({
      locale,
      translatedLabel: true,
      savedTextsRetained: true,
      privateRepliesOnly: true,
    });
  }
  if (errors.length) {
    throw Error(JSON.stringify(errors));
  }
  return { results, errors, liveProvider: false };
};
await writeFile(
  'ci-logs/vk-greeting-catalog-mcp-code.js',
  mcpInspectionCode(inspect, {
    base: process.argv[2],
    root: resolve('.'),
    texts: ['Hello <MCP> & 👋', 'Hi from independent review'],
    storage: [
      [
        TUTORIAL_STORAGE_KEY,
        JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
      ],
    ],
    labels: Object.fromEntries(
      ['en', 'ru', 'hi', 'zh'].map((locale) => [
        locale,
        dictionaries[locale]['greetings.texts'],
      ])
    ),
  })
);
