import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { tokenFixtureValue } from './vk-token-fixture.mjs';
const { base } = JSON.parse(
  await readFile('ci-logs/vk-token-mcp-server.json', 'utf8')
);
const words = Object.fromEntries(
  ['en', 'ru', 'hi', 'zh'].map((language) => [
    language,
    Object.fromEntries(
      Object.entries(dictionaries[language]).filter(([key]) =>
        key.startsWith('vkToken.')
      )
    ),
  ])
);
await writeFile(
  'ci-logs/vk-token-mcp-code.js',
  `async (page) => {
  const base = ${JSON.stringify(base)}, words = ${JSON.stringify(words)};
  const directory = ${JSON.stringify(resolve('docs/screenshots/issue-56-vk-token'))};
  const token = ${JSON.stringify(tokenFixtureValue)};
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith(base+'/api/vk/token/') && request.method() === 'POST') writes.push(request.url().split('/').at(-1));
  });
  await page.addInitScript(({key,version}) => globalThis.localStorage.setItem(key,JSON.stringify({off:true,v:version})),
    {key:${JSON.stringify(TUTORIAL_STORAGE_KEY)},version:${JSON.stringify(TUTORIAL_VERSION)}});
  await page.goto(base+'/#conn-vk/manual');
  const panel = page.locator('[data-vk-token]');
  await panel.locator('[data-vk-token-state=idle], [data-vk-token-state=saved]').waitFor();
  const result = [];
  for (const language of ['en','ru','hi','zh']) {
    await page.evaluate(language => globalThis.localStorage.setItem('metaSovereignLocale',language),language);
    const count = writes.length;
    await page.reload();
    await panel.locator('[data-vk-token-state]').filter({hasText: /./}).waitFor();
    await panel.getByRole('heading',{name:words[language]['vkToken.title'],exact:true}).waitFor();
    const input = panel.locator('[data-vk-token-value]'), confirm = panel.locator('[data-vk-token-confirm]');
    const action = name => panel.locator('[data-vk-token-action='+name+']');
    if (!await action('start').isDisabled()) throw new Error('Missing fresh confirmation');
    if (await input.getAttribute('type') !== 'password' || await input.inputValue()) throw new Error('Credential field persisted or visible');
    if (writes.length !== count) throw new Error('Reload replayed mutation');
    await input.fill('https://foreign.invalid/#access_token='+token);
    await confirm.check();
    await action('import').click();
    await panel.getByText(words[language]['vkToken.invalid-token-redirect'],{exact:true}).waitFor();
    await input.fill(token);
    await confirm.check();
    await action('import').click();
    await panel.getByText(words[language]['vkToken.saved'],{exact:true}).waitFor();
    if (await input.inputValue() || await confirm.isChecked()) throw new Error('Credential or consent retained after import');
    await panel.locator('[data-vk-token-identity]').filter({hasText:'42'}).waitFor();
    if ((await page.evaluate(() => JSON.stringify({...globalThis.localStorage}))).includes(token)) throw new Error('Browser credential persistence');
    for (const [name,width,height] of [['desktop',1180,950],['phone',390,844]]) {
      await page.setViewportSize({width,height});
      await panel.evaluate(element => element.scrollIntoView({block:'start'}));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)) throw new Error('Horizontal overflow');
      await page.screenshot({path:directory+'/mcp-'+language+'-'+name+'.png'});
    }
    result.push({language,translated:true,invalidRedirectRefused:true,protectedSave:true,freshConsent:true,readOnlyReload:true,passwordOnly:true,desktopAndPhoneFit:true});
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  return {result,errors,writes,liveProvider:false};
}`
);
