/** Generate an independent MCP inspection for the owned acceptance fixture. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
const { base } = JSON.parse(
  await readFile('ci-logs/friend-stats-mcp-server.json', 'utf8')
);
const words = Object.fromEntries(
  ['en', 'ru', 'hi', 'zh'].map((language) => [
    language,
    {
      title: dictionaries[language]['vkFriendStats.title'],
      summary: dictionaries[language]['vkFriendStats.summary']
        .replace('{id}', '1')
        .replace('{count}', '2'),
      initial: dictionaries[language]['vkFriendStats.initial'].replace(
        '{count}',
        '1'
      ),
    },
  ])
);
await writeFile(
  'ci-logs/friend-stats-mcp-code.js',
  `async (page) => {
  const base = ${JSON.stringify(base)};
  const dir = ${JSON.stringify(resolve('docs/screenshots/issue-56-friend-stats'))};
  const words = ${JSON.stringify(words)};
  const pageErrors = [], consoleErrors = [], requestFailures = [];
  await page.route(base+'/**', route => route.continue());
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => requestFailures.push({url:request.url(), error:request.failure()?.errorText}));
  await page.addInitScript(({key, version}) => localStorage.setItem(key, JSON.stringify({off:true,v:version})),
    {key:${JSON.stringify(TUTORIAL_STORAGE_KEY)},version:${JSON.stringify(TUTORIAL_VERSION)}});
  await page.goto(base + '/#conn-vk/manual');
  const result = [];
  for (const language of ['en', 'ru', 'hi', 'zh']) {
    await page.evaluate(language => localStorage.setItem('metaSovereignLocale', language), language);
    await page.reload();
    const banner = page.locator('[data-vk-friend-stats]');
    const summary = banner.locator('summary');
    await summary.waitFor();
    if ((await summary.innerText()) !== words[language].summary ||
        (await banner.getAttribute('aria-label')) !== words[language].title) throw new Error('Translation mismatch: '+language);
    await summary.focus();
    await page.keyboard.press('Enter');
    if (!(await banner.innerText()).includes(words[language].initial)) throw new Error('Initial count mismatch');
    for (const [name,width,height] of [['desktop',1180,950],['phone',390,844]]) {
      await page.setViewportSize({width,height});
      await banner.scrollIntoViewIfNeeded();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1);
      if (!fits) throw new Error('Horizontal overflow: '+language+'/'+name);
      await page.screenshot({path:dir+'/mcp-'+language+'-'+name+'.png'});
    }
    result.push({language, translated:true, initialCount:1, accepted:2, desktopAndPhoneFit:true});
  }
  if (pageErrors.length) throw new Error(JSON.stringify(pageErrors));
  return {result,pageErrors,consoleErrors,requestFailures,liveProvider:false};
}`
);
