/** Generate a read-only independent inspection of the owned log fixture. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const { base } = JSON.parse(
  await readFile('ci-logs/runner-log-mcp-server.json', 'utf8')
);
const words = Object.fromEntries(
  ['en', 'ru', 'hi', 'zh'].map((language) => [
    language,
    Object.fromEntries(
      Object.entries(dictionaries[language]).filter(([key]) =>
        key.startsWith('diagnostics.')
      )
    ),
  ])
);
await writeFile(
  'ci-logs/runner-log-mcp-code.js',
  `async (page) => {
  const base = ${JSON.stringify(base)};
  const directory = ${JSON.stringify(resolve('docs/screenshots/issue-56-runner-log'))};
  const words = ${JSON.stringify(words)};
  const pageErrors = [], consoleErrors = [], requestFailures = [], responses = [];
  await page.route(base + '/**', route => route.continue());
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(({ key, version }) => localStorage.setItem(key, JSON.stringify({ off: true, v: version })),
    { key: ${JSON.stringify(TUTORIAL_STORAGE_KEY)}, version: ${JSON.stringify(TUTORIAL_VERSION)} });
  await page.goto(base + '/#settings');
  const result = [];
  for (const language of ['en', 'ru', 'hi', 'zh']) {
    await page.evaluate(language => localStorage.setItem('metaSovereignLocale', language), language);
    await page.reload();
    const panel = page.locator('.diagnostics-settings');
    await panel.locator('[data-action=diagnostics-open]').click();
    const configuration = panel.locator('[data-diagnostic-configuration]');
    await configuration.locator('[data-diagnostic-session=persisted]').waitFor();
    await configuration.getByText(words[language]['diagnostics.verboseHint'], { exact: true }).waitFor();
    if (await configuration.locator('[data-action=diagnostics-save]').innerText() !== words[language]['diagnostics.save']) throw new Error('Untranslated save control: '+language);
    const checkbox = configuration.locator('[data-action=diagnostics-verbose]');
    const original = await checkbox.isChecked();
    await checkbox.setChecked(!original);
    await configuration.locator('[data-action=diagnostics-save]').click();
    await configuration.getByText(words[language]['diagnostics.settingsSaved'], { exact: true }).waitFor();
    if (await checkbox.isChecked() !== !original) throw new Error('Preference acknowledgement mismatch');
    await configuration.locator('[data-action=diagnostics-reload]').click();
    await configuration.locator('[data-diagnostic-session=persisted]').waitFor();
    await page.waitForFunction(expected => document.querySelector('[data-action=diagnostics-verbose]')?.checked === expected, !original);
    for (const [name, width, height] of [['desktop',1180,950], ['phone',390,844]]) {
      await page.setViewportSize({ width, height });
      await configuration.scrollIntoViewIfNeeded();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) throw new Error('Horizontal overflow: '+language+'/'+name);
      await page.screenshot({ path: directory+'/mcp-'+language+'-'+name+'.png' });
    }
    await panel.locator('[data-action=diagnostics-open]').click();
    await configuration.waitFor({ state: 'detached' });
    result.push({ language, translated: true, acknowledgedSave: true, acknowledgedReload: true, desktopAndPhoneFit: true, collapsedOwnerDisposed: true });
  }
  // This fixture explicitly has no Telegram account. Its unrelated settings
  // reads truthfully refuse those capabilities; keep every response as evidence.
  const unsupported = new Set(['folders', 'folders-suggested', 'wallpapers', 'cloud-themes', 'ringtones', 'proxy-get'].map(name => base+'/api/telegram/'+name));
  const unexpected = responses.filter(response => response.status !== 404 || !unsupported.has(response.url));
  if (pageErrors.length || unexpected.length || consoleErrors.length !== responses.length) throw new Error(JSON.stringify({ pageErrors, consoleErrors, responses }));
  return { result, pageErrors, consoleErrors, requestFailures, expectedUnavailableProviderResponses: responses, unexpectedResponses: unexpected, liveProvider: false };
}`
);
