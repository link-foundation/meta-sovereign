import { readFile, writeFile } from 'node:fs/promises';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const { base } = JSON.parse(
  (await readFile('ci-logs/runner-health-mcp-server.log', 'utf8')).split(
    '\n'
  )[0]
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
  let reads = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => { if (request.url().includes('/api/runner/inspect?')) reads++; });
  await page.addInitScript(({ key, version }) => localStorage.setItem(key, JSON.stringify({ off: true, v: version })), ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [language, words] of Object.entries(${JSON.stringify(words)})) {
    await page.evaluate((language) => localStorage.setItem('metaSovereignLocale', language), language);
    await page.goto(${JSON.stringify(base)} + '/?health-review=' + language + '#settings');
    const panel = page.locator('[data-runner-settings]');
    await panel.getByRole('heading', { name: words['runner.title'], exact: true }).waitFor();
    await panel.locator('[data-runner-open]').click();
    const local = panel.locator('[data-runner-mode=local]');
    await local.locator('[data-runner-state=running]').waitFor();
    if (await local.locator('[data-runner-health]').count()) throw Error('optimistic application health');
    await local.getByRole('button', { name: words['runner.inspect'], exact: true }).click();
    await local.locator('[data-runner-health=ready]').waitFor();
    for (const phone of [false, true]) {
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 950 });
      await panel.evaluate((element) => { element.scrollIntoView({ block: 'start' }); scrollBy(0, -64); });
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error(language + ': overflow');
      const text = await panel.innerText();
      if (text.includes('runner.') || !text.includes(words['runner.health_ready'])) throw Error(language + ': untranslated health');
      await page.screenshot({ path: 'docs/screenshots/issue-56-runner-health-mcp-' + language + (phone ? '-phone' : '') + '.png' });
    }
    await panel.locator('[data-runner-open]').click();
    await local.waitFor({ state: 'detached' });
    result.push({ language, translated: true, explicitApplicationHealth: true, desktopAndPhoneFit: true });
  }
  if (errors.length || reads !== 4) throw Error(JSON.stringify({ errors, reads }));
  return { result, pageErrors: errors.length, reads, liveProvider: false };
}`;
await writeFile('ci-logs/runner-health-mcp-code.js', code);
