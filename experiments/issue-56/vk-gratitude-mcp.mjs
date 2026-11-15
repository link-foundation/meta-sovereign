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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://vk.com/sticker/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><text y="95" font-size="90">🙏</text></svg>',
    })
  );
  await page.addInitScript(([key, value]) => {
    globalThis.localStorage.setItem(key, value);
  }, data.tutorial);
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(data.base);
  const results = [];
  for (const [locale, labels] of Object.entries(data.labels)) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.goto(`${data.base}/?gratitude=${locale}#/automation`);
    await page.locator('[data-automation="automation:gratitude"]').click();
    const fields = page.locator('[data-gratitude-fields]');
    await fields.waitFor();
    if (!(await fields.innerText()).includes(labels.stickers)) {
      throw Error(`Missing ${locale} sticker label`);
    }
    const editor = page.locator('.automation-editor');
    const prefer = fields.locator('[name="preferSticker"]');
    const formal = editor.locator('[name="formal"]');
    if (locale === 'en') {
      await prefer.uncheck();
      await formal.fill(data.text);
      const saving = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/automations') && r.request().method() === 'PUT'
      );
      await editor
        .getByRole('button', { name: labels.save, exact: true })
        .click();
      if ((await saving).status() !== 200) {
        throw Error('Save failed');
      }
      await page.reload();
      await page.locator('[data-automation="automation:gratitude"]').click();
    }
    if (
      (await prefer.isChecked()) ||
      (await formal.inputValue()) !== data.text
    ) {
      throw Error('Saved gratitude choices changed on navigation');
    }
    const previewing = page.waitForResponse((r) =>
      r.url().endsWith('/api/automations/plan')
    );
    await editor
      .getByRole('button', { name: labels.preview, exact: true })
      .click();
    if ((await previewing).status() !== 200) {
      throw Error('Preview failed');
    }
    const preview = page.locator('.automation-plan');
    await preview.waitFor();
    const texts = await preview.locator('blockquote').allTextContents();
    if (JSON.stringify(texts) !== JSON.stringify([data.text, data.text])) {
      throw Error(`Unsafe or missing preview: ${texts}`);
    }
    if ((await preview.innerText()).includes('gratitude-message-required')) {
      throw Error('Untranslated refusal');
    }
    if (locale === 'en') {
      await page.setViewportSize({ width: 390, height: 844 });
      await fields.scrollIntoViewIfNeeded();
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ))
      ) {
        throw Error('Phone overflow');
      }
      await page.screenshot({
        path: `${data.root}/docs/screenshots/issue-56-vk-gratitude/mcp-phone.png`,
      });
      await page.setViewportSize({ width: 1180, height: 950 });
    }
    results.push({
      locale,
      translatedLabels: true,
      savedChoicesRetained: true,
      privateRepliesOnly: true,
    });
  }
  if (errors.length) {
    throw Error(JSON.stringify(errors));
  }
  return { results, errors, liveProvider: false };
};
await writeFile(
  'ci-logs/vk-gratitude-mcp-code.js',
  mcpInspectionCode(inspect, {
    base: process.argv[2],
    root: resolve('.'),
    text: 'You are welcome <MCP> & 🙏',
    tutorial: [
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
    ],
    labels: Object.fromEntries(
      ['en', 'ru', 'hi', 'zh'].map((locale) => [
        locale,
        {
          stickers: dictionaries[locale]['gratitude.stickers'],
          save: dictionaries[locale]['common.save'],
          preview: dictionaries[locale]['automations.preview'],
        },
      ])
    ),
  })
);
