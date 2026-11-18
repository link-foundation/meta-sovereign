import { readFile, writeFile } from 'node:fs/promises';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';

const { base, stats } = JSON.parse(
  (
    await readFile('ci-logs/application-collection-mcp-server.log', 'utf8')
  ).split(/\r?\n/u)[0]
);
const work = `async (page, createControls) => {
  const assert = { equal(a, b) { if (a !== b) throw new Error('Browser assertion failed: '+JSON.stringify({actual:a,expected:b})); } };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const controls = createControls({ page, base: ${JSON.stringify(base)} });
  const { panel, action } = controls;
  await controls.select();
  const before = await (await page.request.get(${JSON.stringify(stats)})).json();
  const check = panel.locator('[data-application-option="collectVacancies"]');
  assert.equal(await check.isChecked(), true);
  await check.uncheck();
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await panel.locator('[data-application-collection="memory"]').waitFor();
  assert.equal((await panel.locator('[data-application-description]').innerText()).includes('Employer’s final paragraph stays intact.'), true);
  await panel.screenshot({ path: 'docs/screenshots/issue-56-application-collection/mcp-desktop.png' });
  await controls.locales('[data-application-collection="memory"]');
  await controls.phone();
  await panel.screenshot({ path: 'docs/screenshots/issue-56-application-collection/mcp-phone.png' });
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  await page.reload();
  await panel.waitFor();
  assert.equal(await panel.locator('[data-application-description]').count(), 0);
  const stats = await (await page.request.get(${JSON.stringify(stats)})).json();
  assert.equal(stats.collection, false);
  assert.equal(stats.journalVacancy, false);
  assert.equal(stats.cacheEntries, 1);
  assert.equal(stats.cacheFingerprint, before.cacheFingerprint);
  assert.equal(stats.closed, true);
  assert.equal(stats.clicks, 0);
  assert.equal(stats.errors.length, 0);
  assert.equal(errors.length, 0);
  return { collection: false, locales: 4, completeContext: true, offlineContext: null, desktopAndPhoneFit: true, pageErrors: errors, ...stats };
}`;
await writeFile(
  'ci-logs/application-collection-mcp-code.js',
  applicationAnswerMcpRunner(work)
);
