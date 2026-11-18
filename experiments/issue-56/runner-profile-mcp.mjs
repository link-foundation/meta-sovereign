import { readFile, writeFile } from 'node:fs/promises';
import { dictionaries } from '../../js/src/web/locales/index.js';
import { formatIndented } from 'lino-objects-codec';
import { dockerProfile } from './runner-docker-fixture.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const layered = process.argv.includes('--layered');
const docker = process.argv.includes('--docker');
const prefix = docker
  ? 'runner-docker'
  : layered
    ? 'runner-configuration'
    : 'runner-profile';
const dockerDocument = docker
  ? formatIndented({ id: 'runner', obj: dockerProfile() })
  : '';
const { base } = JSON.parse(
  (await readFile(`ci-logs/${prefix}-mcp-server.log`, 'utf8')).split('\n')[0]
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
  let saves = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => { if (request.url().endsWith('/api/runner/configure')) saves++; });
  await page.addInitScript(({ key, version }) => localStorage.setItem(key, JSON.stringify({ off: true, v: version })), ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [language, words] of Object.entries(${JSON.stringify(words)})) {
    await page.evaluate((language) => localStorage.setItem('metaSovereignLocale', language), language);
    await page.goto(${JSON.stringify(base)} + '/?profile-review=' + language + '#settings');
    const panel = page.locator('[data-runner-settings]');
    await panel.getByRole('heading', { name: words['runner.title'], exact: true }).waitFor();
    await panel.locator('[data-runner-open]').click();
    await panel.locator('[data-runner-profile-open]').click();
    const editor = panel.locator('[data-runner-profile-editor]');
    const input = editor.locator('[data-runner-profile-document]');
    await page.waitForFunction(() => !document.querySelector('[data-runner-profile-document]').disabled);
    const source = await input.inputValue();
    if (${layered} && !/port 8128\\b/.test(source)) throw Error('local precedence missing');
    const draft = (${JSON.stringify(dockerDocument)} || source).replace(/fixture@example.invalid|local@example.invalid|review-[a-z]+@example.invalid/g, 'review-' + language + '@example.invalid');
    if (${docker} && !draft.includes('isolation docker')) throw Error('missing Docker profile');
    if (!draft.includes('review-' + language + '@example.invalid')) throw Error('missing fixture target');
    await input.fill(draft);
    await editor.getByRole('button', { name: words['runner.profileSave'], exact: true }).click();
    await editor.locator('[data-runner-profile-saved]').waitFor();
    if (!await editor.getByRole('button', { name: words['runner.profileSave'], exact: true }).isDisabled()) throw Error('unchanged save enabled');
    for (const phone of [false, true]) {
      await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1180, height: 950 });
      await editor.evaluate((element) => { element.scrollIntoView({ block: 'start' }); scrollBy(0, -64); });
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error(language + ': overflow');
      const text = await editor.innerText();
      if (text.includes('runner.') || !text.includes(words['runner.profileSaved'])) throw Error(language + ': untranslated editor');
      if (${docker} ? language === 'en' : !${layered} || (language === 'en' && phone)) await page.screenshot({ path: ${JSON.stringify(docker ? 'docs/screenshots/issue-56-runner-docker/mcp-' : layered ? 'docs/screenshots/issue-56-runner-configuration/mcp-' : 'docs/screenshots/issue-56-runner-profile-mcp-')} + language + (phone ? '-phone' : '') + '.png' });
    }
    await panel.locator('[data-runner-open]').click();
    await editor.waitFor({ state: 'detached' });
    if (${layered || docker}) {
      const previousSaves = saves;
      await page.reload();
      const reloaded = page.locator('[data-runner-settings]');
      await reloaded.locator('[data-runner-open]').click();
      await reloaded.locator('[data-runner-profile-open]').click();
      await page.waitForFunction(() => !document.querySelector('[data-runner-profile-document]').disabled);
      if (!await reloaded.locator('[data-runner-profile-document]').inputValue().then((value) => value.includes('review-' + language + '@example.invalid') && (${docker} ? value.includes('isolation docker') && value.includes('registry.example/owner/runtime:26') : /port 8128\\b/.test(value)))) throw Error('saved profile lost');
      if (saves !== previousSaves) throw Error('reload replayed configuration');
    }
    result.push({ language, translated: true, profileAcknowledged: true, desktopAndPhoneFit: true });
  }
  if (errors.length || saves !== 4) throw Error(JSON.stringify({ errors, saves }));
  return { result, pageErrors: errors.length, saves, localPrecedence: ${layered}, remoteDockerSaved: ${docker}, liveProvider: false };
}`;
await writeFile(`ci-logs/${prefix}-mcp-code.js`, code);
