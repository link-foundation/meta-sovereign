import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspect = async (page, fixture) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(
    ([key, value]) => globalThis.localStorage.setItem(key, value),
    fixture.tutorial
  );
  await page.goto(fixture.base);
  const result = [];
  const ready = () =>
    page.waitForFunction(() => {
      const input = document.querySelector(
        '[data-action=vk-attachments-enabled]'
      );
      return input && !input.disabled;
    });
  for (const [language, words] of Object.entries(fixture.words)) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      language
    );
    await page.goto(
      `${fixture.base}/?attachmentLocale=${language}#conn-vk/manual`
    );
    const panel = page.locator('[data-vk-attachments]');
    await panel
      .getByRole('heading', { name: words.title, exact: true })
      .waitFor();
    await panel.locator('[data-vk-attachment]').first().waitFor();
    if (
      !(await panel.innerText()).includes(words.hint) ||
      !(await panel.innerText()).includes(words.enabled)
    ) {
      throw Error(`Missing translated collection controls: ${language}`);
    }
    const enabled = panel.locator('[data-action=vk-attachments-enabled]');
    await ready();
    const previous = await enabled.isChecked();
    const changing = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/vk/attachments') &&
        response.request().method() === 'POST'
    );
    await enabled.click();
    if ((await changing).status() !== 200) {
      throw Error('Collection configuration was not acknowledged');
    }
    await page.waitForFunction((checked) => {
      const input = document.querySelector(
        '[data-action=vk-attachments-enabled]'
      );
      return input && !input.disabled && input.checked === checked;
    }, !previous);
    await page.reload();
    await ready();
    if (
      (await enabled.isChecked()) === previous ||
      (await panel.locator('[data-vk-attachment]').count()) !== 3
    ) {
      throw Error(
        'Acknowledged configuration or saved metadata lost on reload'
      );
    }
    const photo = panel.locator(
      '[data-vk-attachment="attachment:vk:photo:41:11"]'
    );
    await photo.locator('summary').click();
    const text = await photo.locator('pre').textContent();
    if (
      !text.includes('First <script>fixture</script> 元数据') ||
      (await photo.locator('script').count())
    ) {
      throw Error('First metadata must remain literal text');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await photo.scrollIntoViewIfNeeded();
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ))
    ) {
      throw Error(`Phone overflow: ${language}`);
    }
    await page.screenshot({
      path: `${fixture.root}/docs/screenshots/issue-56-vk-attachments/mcp-${language}-phone.png`,
    });
    result.push({
      language,
      translated: true,
      retainedRecords: 3,
      savedChoiceRetained: true,
      literalMetadata: true,
    });
  }
  if (errors.length) {
    throw Error(JSON.stringify(errors));
  }
  return { result, errors, liveProvider: false };
};

await writeFile(
  'ci-logs/vk-attachments-mcp-code.js',
  mcpInspectionCode(inspect, {
    base: process.argv[2],
    root: resolve('.'),
    tutorial: [
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
    ],
    words: Object.fromEntries(
      ['en', 'ru', 'hi', 'zh'].map((language) => [
        language,
        Object.fromEntries(
          ['title', 'hint', 'enabled'].map((key) => [
            key,
            dictionaries[language][`vkAttachments.${key}`],
          ])
        ),
      ])
    ),
  })
);
