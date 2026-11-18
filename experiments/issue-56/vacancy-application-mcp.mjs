import { readFile, writeFile } from 'node:fs/promises';
import { dictionaries } from '../../js/src/web/locales/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
const { base, stats } = JSON.parse(
  (await readFile('ci-logs/vacancy-application-mcp-server.log', 'utf8')).split(
    '\n'
  )[0]
);
const words = Object.fromEntries(
  Object.entries(dictionaries).map(([locale, entries]) => [
    locale,
    entries['vacancy.appliedAt'],
  ])
);
const code = `async (page) => {
  const errors = [], failures = [], writes = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => failures.push({url: request.url(), error: request.failure()?.errorText}));
  page.on('request', request => {if (request.method() === 'POST') writes.push(new URL(request.url()).pathname);});
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await page.addInitScript(({key, version}) => localStorage.setItem(key, JSON.stringify({off:true,v:version})), ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
    await page.goto(${JSON.stringify(base)} + '/?applied-cache-mcp=1#/cv');
    const panel = page.locator('[data-vacancies]');
    const snapshot = panel.locator('[data-vacancy-snapshot]');
    const select = async () => {await panel.locator('[data-vacancy-action^="assignment-vacancy:"]').first().click();await snapshot.locator('[data-vacancy-applied]').waitFor();};
    await select();
    const original = await snapshot.locator('[data-vacancy-applied]').innerText();
    const refreshReceipt = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/vacancies/collect');
    await snapshot.locator('[data-vacancy-action="refresh"]').click();
    if ((await refreshReceipt).status() !== 200) throw Error('Native refresh was not acknowledged');
    await page.waitForFunction(() => !document.querySelector('[data-vacancy-action="refresh"]').disabled);
    if (await snapshot.locator('[data-vacancy-applied]').innerText() !== original) throw Error('Refresh replaced delivery evidence');
    for (const [locale, word] of Object.entries(${JSON.stringify(words)})) {
      await page.evaluate(value => localStorage.setItem('metaSovereignLocale',value), locale);
      await page.reload();await select();
      if (!(await snapshot.locator('[data-vacancy-applied]').innerText()).startsWith(word.split('{date}')[0])) throw Error('Missing localized confirmation');
    }
    await page.evaluate(() => localStorage.setItem('metaSovereignLocale','en'));
    await page.reload();await select();
    for (const phone of [false,true]) {
      await page.setViewportSize(phone ? {width:390,height:900}:{width:1180,height:950});
      await snapshot.scrollIntoViewIfNeeded();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
      await page.screenshot({path:'docs/screenshots/issue-56-vacancy-application/applied-cache-mcp-'+(phone?'phone':'after')+'.png'});
    }
    const receipt = await (await page.request.get(${JSON.stringify(stats)})).json();
    const unexpectedFailures = failures.filter(row => row.error !== 'net::ERR_ABORTED');
    if (errors.length || unexpectedFailures.length || !receipt.closed || receipt.outcomes.length !== 1 || receipt.outcomes[0].attempts !== 1) throw Error(JSON.stringify({errors,failures,receipt}));
    if (writes.some(path => /application-(?:open|advance|continue)/u.test(path))) throw Error('Recovery replayed an application');
    return {locales:4,refreshPreservedConfirmation:true,desktopAndPhoneFit:true,errors,unexpectedFailures,navigationAborts:failures,writes,...receipt};
  } finally {await cdp.detach();}
}`;
await writeFile('ci-logs/vacancy-application-mcp-code.js', code);
