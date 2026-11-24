import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { applicationPanelBrowser } from '../../js/tests/helpers/application-panel-browser.mjs';
import {
  verifyVacancySkipRetryLocales,
  clearVacancySkipReason,
} from '../../js/tests/helpers/e2e-vacancy-skip-retries.mjs';

const connection = JSON.parse(
  (await readFile('ci-logs/vacancy-skip-retries-mcp-server.log', 'utf8')).split(
    '\n'
  )[0]
);
const directory = resolve('docs/screenshots/issue-56-vacancy-skip-retries');
const verify = async (page, connection, directory) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!globalThis.localStorage.getItem('metaSovereignLocale')) {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    }
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  const controls = applicationPanelBrowser({ page, base: connection.base });
  const { panel, action } = controls;
  const owner = async (path = '', method = 'GET') =>
    (await fetch(`${connection.stats}/${path}`, { method })).json();
  await controls.select();
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await owner('disabled-apply', 'POST');
  await controls.confirmed('read');
  const first = await owner();
  assert.equal(first.skips.entries[0].reason, 'apply_button_disabled');
  assert.equal(first.skips.entries[0].attempts, 1);
  await owner('enable-apply', 'POST');
  await controls.confirmed('read');
  await controls.confirmed('enter');
  await owner('disabled-send', 'POST');
  await controls.confirmed('read');
  const second = await owner();
  assert.equal(second.skips.entries[0].reason, 'button_disabled');
  assert.equal(second.skips.entries[0].attempts, 1);
  assert.equal(second.native.experience, 'Independent owner answer.');
  assert.equal(second.native.header, 'Owner header');
  assert.equal(second.native.attempts, 0);
  await controls.confirmed('read');
  assert.equal((await owner()).skips.revision, second.skips.revision);
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  await page.reload();
  const skips = page.locator('[data-vacancy-skips="jobs"]');
  const row = skips.locator('[data-vacancy-skip="https://hh.ru/vacancy/123"]');
  await row.locator('[data-vacancy-skip-recovery="next-run"]').waitFor();
  await skips.screenshot({ path: `${directory}/mcp-after.png` });
  await controls.phone();
  await skips.screenshot({ path: `${directory}/mcp-phone.png` });
  await verifyVacancySkipRetryLocales(page, skips);
  await clearVacancySkipReason(page, skips, row, 'button_disabled');
  const final = await owner();
  assert.equal(final.closed, true);
  assert.equal(final.skips.entries.length, 0);
  assert.equal(final.errors.length + errors.length, 0);
  assert.equal(
    final.outcomes.every((outcome) => outcome.attempts === 0),
    true
  );
  return {
    nativeDisabledControls: 2,
    sameRunCount: 1,
    stableReads: true,
    ownerAnswerPreserved: true,
    translatedLocales: 4,
    clearPersisted: true,
    phoneFits: true,
    submissions: 0,
    browserClosed: true,
    errors,
  };
};
const code = `async (page) => {
  const assert = {
    equal(a, b, message) { if (a !== b) throw new Error(message ?? String(a) + ' !== ' + String(b)); },
    doesNotMatch(a, expression) { if (expression.test(a)) throw new Error('Untranslated browser controls'); }
  };
  const applicationPanelBrowser = ${applicationPanelBrowser.toString()};
  const verifyVacancySkipRetryLocales = ${verifyVacancySkipRetryLocales.toString()};
  const clearVacancySkipReason = ${clearVacancySkipReason.toString()};
  return (${verify.toString()})(page, ${JSON.stringify(connection)}, ${JSON.stringify(directory)});
}`;
await writeFile('ci-logs/vacancy-skip-retries-mcp-code.js', code);
