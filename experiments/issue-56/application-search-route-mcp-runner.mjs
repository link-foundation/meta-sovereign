import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

const parameters = {
  ...JSON.parse(
    (await readFile('ci-logs/application-route-mcp-server.log', 'utf8')).split(
      /\r?\n/u
    )[0]
  ),
  originalSearch: originalApplicationSearch,
};
const verify = async (
  page,
  createControls,
  { base, stats, originalSearch }
) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('about:blank');
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
    if (!globalThis.localStorage.getItem('metaSovereignLocale')) {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    }
  });
  const controls = createControls({ page, base });
  const { panel, action } = controls;
  await controls.select();
  await panel
    .locator('[data-application-option="vacancyPreviewSeconds"]')
    .fill('0');
  await panel
    .locator('[data-application-option="applyFromVacancyPage"]')
    .uncheck();
  await panel
    .locator('[data-application-option="applicationSearchUrl"]')
    .fill(originalSearch);
  const directory = 'docs/screenshots/issue-56-application-search-route';
  await panel
    .locator('[data-application-option="applyFromVacancyPage"]')
    .locator('../..')
    .screenshot({ path: `${directory}/mcp-settings.png` });
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await action('recover').click();
  const route = panel.locator('[data-application-route="search"]');
  await route.waitFor();
  await controls.confirmed('enter');
  await panel.locator('[data-application-state="review"]').waitFor();
  await panel.screenshot({ path: `${directory}/mcp-after.png` });
  const locales = [];
  await controls.locales(
    '[data-application-route="search"]',
    async (locale) => {
      await route.screenshot({ path: `${directory}/mcp-${locale}.png` });
      locales.push(locale);
    }
  );
  await controls.phone();
  await panel.screenshot({ path: `${directory}/mcp-phone.png` });
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  const receipt = await (await page.request.get(stats)).json();
  assert.equal(receipt.closed && receipt.outcomes.length === 1, true);
  const outcome = receipt.outcomes[0];
  assert.equal(
    outcome.url.includes('vacancyId=123&startedWithQuestion=false'),
    true
  );
  assert.equal(outcome.entries === 0 && outcome.attempts === 0, true);
  assert.equal(errors.length === 0 && receipt.errors.length === 0, true);
  return {
    ...receipt,
    locales,
    searchRoute: true,
    recoveredWithoutReplay: true,
    phoneFits: true,
    pageErrors: errors,
  };
};
await writeFile(
  'ci-logs/application-route-mcp-code.js',
  applicationAnswerMcpRunner(
    `(page, createControls, _configure, fixture) => (${verify.toString()})(page, createControls, fixture)`,
    parameters
  )
);
