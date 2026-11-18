import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';

const images = fileURLToPath(
  new URL(
    '../../docs/screenshots/issue-56-ci-application-context/',
    import.meta.url
  )
);
const work = `async (page, makeControls) => {
  const url = new URL(page.url());
  const before = url.searchParams.get('phase') === 'before';
  const stats = url.searchParams.get('stats');
  if (!stats) throw new Error('Supply the owned fixture stats URL.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    if (!localStorage.getItem('context-evidence-initialized')) {
      localStorage.setItem('metaSovereignTutorial', '{"off":true,"v":5}');
      localStorage.setItem('metaSovereignLocale', 'en');
      localStorage.removeItem('meta-sovereign:hh-application-intent');
      localStorage.setItem('context-evidence-initialized', '1');
    }
  });
  await page.setViewportSize({ width: 1200, height: 1050 });
  const controls = makeControls({ page, base: url.origin });
  const { panel, action } = controls;
  await controls.select();
  await panel.locator('[data-application-option="autoSelectResumeLanguage"]').check();
  await panel.locator('[data-application-option="supervised"]').check();
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await controls.confirm();
  const pending = page.waitForResponse((response) => response.url().endsWith('/application-advance'));
  await action('enter').click();
  const response = await pending;
  const body = await response.text();
  if (before) {
    if (response.ok() || !body.includes('jobs-application-resume-context')) throw new Error(body);
    await panel.getByText(/jobs-application-unconfirmed/).waitFor();
  } else {
    if (!response.ok()) throw new Error(body);
    try {
      await panel.locator('[data-application-resume-preference="automatic"]').waitFor();
    } catch (error) {
      throw new Error(JSON.stringify({ error: String(error), body, panel: await panel.innerText() }));
    }
    if (!await action('submit').isDisabled()) throw new Error('Send lacks a fresh confirmation.');
  }
  await panel.screenshot({ path: ${JSON.stringify(images)} + 'context-' + (before ? 'before' : 'after') + '.png' });
  if (!before) {
    await controls.locales('[data-application-resume-preference="automatic"]', async (locale) => {
      if (await page.evaluate(() => localStorage.getItem('metaSovereignLocale')) !== locale) {
        throw new Error('Reload replaced the chosen locale.');
      }
    });
    await controls.phone();
    await panel.screenshot({ path: ${JSON.stringify(images)} + 'context-phone.png' });
  }
  if (before) {
    await action('recover').click();
    await panel.locator('[data-application-state="review"]').waitFor();
  }
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  const native = await (await page.request.get(stats)).json();
  if (!native.closed || native.errors.length || errors.length) throw new Error(JSON.stringify({ native, errors }));
  return { before, native, errors, responseStatus: response.status(), automaticChoice: !before,
    locales: before ? 0 : 4, phoneOverflow: false, liveProvider: false };
}`;
await writeFile(
  new URL(
    '../../ci-logs/ci-application-context-mcp-runner.js',
    import.meta.url
  ),
  applicationAnswerMcpRunner(work)
);
