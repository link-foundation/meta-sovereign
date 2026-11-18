import { readFile, writeFile } from 'node:fs/promises';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const { base } = JSON.parse(
  (await readFile('ci-logs/runner-ui-mcp-server.log', 'utf8')).split('\n')[0]
);
const words = Object.fromEntries(
  Object.entries(dictionaries).map(([language, dictionary]) => [
    language,
    Object.fromEntries(
      Object.entries(dictionary).filter(([key]) => key.startsWith('runner.'))
    ),
  ])
);
const code = `async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
  }, ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [language, words] of Object.entries(${JSON.stringify(words)})) {
    await page.evaluate((language) => localStorage.setItem('metaSovereignLocale', language), language);
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.goto(${JSON.stringify(base)} + '/?runner-review=' + language + '#settings');
    const panel = page.locator('[data-runner-settings]');
    await panel.getByRole('heading', { name: words['runner.title'], exact: true }).waitFor();
    await panel.locator('[data-runner-open]').click();
    const mode = (name) => panel.locator('[data-runner-mode=' + name + ']');
    const observed = (name, state) => mode(name).locator('[data-runner-state=' + state + ']').waitFor();
    await observed('local', 'stopped');
    await observed('server', 'stopped');
    await mode('local').getByRole('button', { name: words['runner.start'], exact: true }).click();
    await observed('local', 'running');
    await mode('server').getByRole('button', { name: words['runner.start'], exact: true }).click();
    await observed('server', 'running');
    await observed('local', 'stopped');
    for (const phone of [false, true]) {
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 950 });
      await panel.scrollIntoViewIfNeeded();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error(language + ': overflow');
      const text = await panel.innerText();
      if (text.includes('runner.') || !text.includes(words['runner.scope'])) throw Error(language + ': untranslated state');
      await page.screenshot({ path: 'docs/screenshots/issue-56-runner-mcp-' + language + (phone ? '-phone' : '') + '.png' });
    }
    await mode('server').getByRole('button', { name: words['runner.stop'], exact: true }).click();
    await observed('server', 'stopped');
    await panel.locator('[data-runner-open]').click();
    await panel.locator('[data-runner-mode]').first().waitFor({ state: 'detached' });
    result.push({ language, translated: true, observedSwitch: true, desktopAndPhoneFit: true });
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  return { result, pageErrors: errors.length, liveProvider: false };
}`;
await writeFile('ci-logs/runner-ui-mcp-code.js', code);
