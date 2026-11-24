import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
const { base } = JSON.parse(
  await readFile('ci-logs/diagnostics-mcp-server.json', 'utf8')
);
const words = Object.fromEntries(
  Object.entries(dictionaries).map(([language, dictionary]) => [
    language,
    Object.fromEntries(
      Object.entries(dictionary).filter(([key]) =>
        key.startsWith('diagnostics.')
      )
    ),
  ])
);
await mkdir('docs/screenshots/issue-56-diagnostics', { recursive: true });
const code = `async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ off: true, v: version }));
  }, ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [language, words] of Object.entries(${JSON.stringify(words)})) {
    await page.evaluate((language) => localStorage.setItem('metaSovereignLocale', language), language);
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.goto(${JSON.stringify(base)} + '/?diagnostic-review=' + language + '#settings');
    const panel = page.locator('.diagnostics-settings');
    await panel.locator('[data-action=diagnostics-open]').click();
    await panel.getByText(words['diagnostics.live'], { exact: true }).waitFor();
    const text = await panel.locator('pre').textContent();
    if (!text.includes('/synthetic-activity') || text.includes('diagnostics.')) throw Error('Missing redacted live log');
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel.getByText(words['diagnostics.copied'], { exact: true }).waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (copied !== text) throw Error('Clipboard receipt mismatch');
    for (const phone of [false, true]) {
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 950 });
      await panel.scrollIntoViewIfNeeded();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      if (!fits) throw Error(language + ': horizontal overflow');
      await page.screenshot({ path: 'docs/screenshots/issue-56-diagnostics/mcp-' + language + (phone ? '-phone' : '') + '.png' });
    }
    await panel.locator('[data-action=diagnostics-open]').click();
    await panel.locator('[data-diagnostic-logs]').waitFor({ state: 'detached' });
    result.push({ language, copiedVisibleRedactedLog: true, desktopAndPhoneFit: true, collapsedViewDisposed: true });
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  return { result, pageErrors: errors.length, liveProvider: false };
}`;
await writeFile('ci-logs/diagnostics-mcp-code.js', code);
const inspection = await readFile('ci-logs/diagnostics-mcp-code.js', 'utf8');
await writeFile(
  'ci-logs/diagnostics-mcp-code.js',
  `async (page) => {
  const session = await page.context().newCDPSession(page);
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', (entry) => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  try {
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    return { ...await (${inspection})(page), consoleErrors, requestFailures };
  } finally { await session.detach(); }
}`
);
