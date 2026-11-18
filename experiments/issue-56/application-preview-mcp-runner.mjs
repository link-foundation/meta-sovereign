import { readFile, writeFile } from 'node:fs/promises';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';

const { base, stats } = JSON.parse(
  (await readFile('ci-logs/application-preview-mcp-server.log', 'utf8')).split(
    /\r?\n/u
  )[0]
);
const work = `async (page, createControls) => {
  const require = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('about:blank');
  await page.addInitScript(() => {
    localStorage.setItem('metaSovereignTutorial', '{"off":true,"v":5}');
    if (!localStorage.getItem('metaSovereignLocale')) localStorage.setItem('metaSovereignLocale', 'en');
  });
  const controls = createControls({ page, base: ${JSON.stringify(base)} });
  const { panel, action } = controls;
  await controls.select();
  const seconds = panel.locator('[data-application-option="vacancyPreviewSeconds"]');
  require(await seconds.inputValue() === '3', 'Missing three-second default');
  await seconds.fill('0.2');
  await seconds.locator('../..').screenshot({ path: 'docs/screenshots/issue-56-vacancy-preview/mcp-setting.png' });
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  const policy = panel.locator('[data-application-preview-seconds="0.2"]');
  await policy.waitFor();
  await action('recover').click();
  await policy.waitFor();
  await controls.confirmed('enter');
  await panel.locator('[data-application-state="review"]').waitFor();
  await panel.screenshot({ path: 'docs/screenshots/issue-56-vacancy-preview/mcp-after.png' });
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(value => localStorage.setItem('metaSovereignLocale', value), locale);
    await page.reload();
    await policy.waitFor();
    require(!/application\\.[a-z]/u.test(await panel.innerText()), 'Untranslated preview receipt');
    await policy.screenshot({ path: 'docs/screenshots/issue-56-vacancy-preview/mcp-'+locale+'.png' });
    locales.push({ locale, seconds: 0.2, recovered: true });
  }
  await controls.phone();
  await panel.screenshot({ path: 'docs/screenshots/issue-56-vacancy-preview/mcp-phone.png' });
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  const receipt = await (await page.request.get(${JSON.stringify(stats)})).json();
  require(receipt.closed && receipt.outcomes.length === 1, 'Owned browser did not drain');
  require(receipt.outcomes[0].entries === 1 && receipt.outcomes[0].attempts === 0, 'Unexpected native application effects');
  require(receipt.errors.length === 0 && errors.length === 0, 'Browser exception');
  return { locales, previewSeconds: 0.2, entries: 1, submissions: 0, recoveredWithoutReplay: true, phoneFits: true, pageErrors: errors, ...receipt };
}`;
await writeFile(
  'ci-logs/application-preview-mcp-code.js',
  applicationAnswerMcpRunner(work)
);
