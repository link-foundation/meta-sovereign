import { readFile, writeFile } from 'node:fs/promises';
import { runnerLocale } from '../../js/src/web/locales/runner.js';

const { base } = JSON.parse(
  (
    await readFile('ci-logs/runner-feedback-mcp-final-server.log', 'utf8')
  ).split('\n')[0]
);
const words = Object.fromEntries(
  ['en', 'ru', 'zh', 'hi'].map((language) => [language, runnerLocale(language)])
);
const code = `async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('metaSovereignTutorial', JSON.stringify({ off: true, v: 5 })));
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [index, [language, words]] of Object.entries(${JSON.stringify(words)}).entries()) {
    await page.evaluate(language => localStorage.setItem('metaSovereignLocale', language), language);
    await page.goto(${JSON.stringify(base)} + '/?feedback-language=' + language + '#settings');
    const panel = page.locator('[data-runner-settings]');
    await panel.getByRole('heading', { name: words['runner.title'], exact: true }).waitFor();
    await panel.locator('[data-runner-open]').click();
    const mode = index % 2 ? 'server' : 'local';
    const target = panel.locator('[data-runner-mode=' + mode + ']');
    await target.locator('[data-runner-state=stopped]').waitFor();
    const feedback = page.locator('[data-runner-feedback]');
    if (await feedback.count()) throw Error('status announced success');
    await target.getByRole('button', { name: words['runner.start'], exact: true }).click();
    await feedback.waitFor();
    if (!(await feedback.innerText()).includes(words['runner.' + mode] + ': ' + words['runner.running'])) throw Error('untranslated receipt');
    if (!(await feedback.innerText()).includes(words['runner.feedbackScope'])) throw Error('missing session scope');
    for (const phone of [false, true]) {
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 950 });
      await panel.evaluate(element => { element.scrollIntoView({ block: 'start' }); scrollBy(0, -64); });
      const fit = await feedback.evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.top >= 0 && box.top < 40 && box.bottom < innerHeight && Math.abs(box.left + box.width/2 - innerWidth/2) < 2 && document.documentElement.scrollWidth <= innerWidth && [...element.querySelectorAll('p')].every(p => p.scrollWidth <= p.clientWidth);
      });
      if (!fit) throw Error(language + ': confirmation overflow');
      await page.screenshot({ path: 'docs/screenshots/issue-56-runner-feedback/mcp-' + language + (phone ? '-phone' : '') + '.png' });
    }
    await feedback.getByRole('button', { name: words['runner.dismissFeedback'], exact: true }).click();
    await panel.locator('[data-runner-action=refresh]').click();
    await target.locator('[data-runner-state=running]').waitFor();
    if (await feedback.count()) throw Error('refresh replayed confirmation');
    await target.getByRole('button', { name: words['runner.stop'], exact: true }).click();
    await page.locator('[data-runner-feedback=' + mode + '-stop]').waitFor();
    if (!(await feedback.innerText()).includes(words['runner.stopped'])) throw Error('stop not translated');
    await page.keyboard.press('Escape');
    await feedback.waitFor({ state: 'detached' });
    await panel.locator('[data-runner-open]').click();
    result.push({ language, mode, translatedStartAndStop: true, topCenterDesktopAndPhone: true, dismissedNotReplayed: true });
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  return { result, pageErrors: errors.length, liveProvider: false };
}`;
await writeFile('ci-logs/runner-feedback-mcp-code.js', code);
