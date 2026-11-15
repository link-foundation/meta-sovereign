import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

/** Independent MCP inspection uses the same locale/reload/phone evidence rules. */
const inspectConnections = async (page, fixture, check) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(
    ([key, value]) => globalThis.localStorage.setItem(key, value),
    fixture.tutorial
  );
  await page.goto(fixture.base);
  const result = [];
  for (const [language, words] of Object.entries(fixture.words)) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      language
    );
    await page.goto(`${fixture.base}/?vkLocale=${language}#conn-vk/manual`);
    const panel = page.locator(`[data-${fixture.feature}]`);
    const ready = () =>
      page.waitForFunction((feature) => {
        const input = document.querySelector(
          `[data-${feature}] input[type=checkbox]`
        );
        return input && !input.disabled;
      }, fixture.feature);
    // A mounted heading and an enabled control distinguish loading from absence.
    await panel
      .getByRole('heading', { name: words.title, exact: true })
      .waitFor();
    await ready();
    for (const key of fixture.keys) {
      if (!(await panel.innerText()).includes(words[key])) {
        throw Error(`Missing ${language}.${key}`);
      }
    }
    const { focus, ...checked } = await check(page, {
      panel,
      words,
      ready,
      feature: fixture.feature,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator(focus).scrollIntoViewIfNeeded();
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ))
    ) {
      throw Error(`Phone overflow: ${language}`);
    }
    await page.screenshot({
      path: `${fixture.root}/docs/screenshots/issue-56-${fixture.feature}/mcp-${language}-phone.png`,
    });
    result.push({ language, translated: true, ...checked });
  }
  if (errors.length) {
    throw Error(JSON.stringify(errors));
  }
  return { result, errors, liveProvider: false };
};

export const writeVkConnectionInspection = async (
  feature,
  prefix,
  keys,
  check
) => {
  await writeFile(
    `ci-logs/${feature}-mcp-code.js`,
    mcpInspectionCode(
      inspectConnections,
      {
        base: process.argv[2],
        root: resolve('.'),
        feature,
        keys,
        tutorial: [
          TUTORIAL_STORAGE_KEY,
          JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
        ],
        words: Object.fromEntries(
          ['en', 'ru', 'hi', 'zh'].map((language) => [
            language,
            Object.fromEntries(
              ['title', ...keys].map((key) => [
                key,
                dictionaries[language][`${prefix}.${key}`],
              ])
            ),
          ])
        ),
      },
      check
    )
  );
};
