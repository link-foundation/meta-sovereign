import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const input = await readFile(
  `ci-logs/vacancy-corpus-${before ? 'before-native' : 'mcp-server'}.log`,
  'utf8'
);
const { base, stats } = JSON.parse(
  input.split('\n').find((line) => line.startsWith('{"base":'))
);
await mkdir('docs/screenshots/issue-56-vacancy-corpus', { recursive: true });
const code = `async (page) => {
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()); });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', {cacheDisabled: true});
    await page.addInitScript(({key, version}) => localStorage.setItem(key, JSON.stringify({off:true,v:version})), ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
    const count = ${before ? 100 : 101};
    await page.goto(${JSON.stringify(base)} + '/?corpus=${phase}#/cv');
    const panel = page.locator('[data-vacancies]');
    const buttons = panel.locator('[data-vacancy-action^="assignment-vacancy:"]');
    const select = async () => {
      await page.waitForFunction(expected => document.querySelectorAll('[data-vacancy-action^="assignment-vacancy:"]').length === expected, count);
      if (await buttons.first().innerText() !== 'Engineer 0' || await buttons.last().innerText() !== 'Engineer '+(count-1)) throw Error('Cache order changed');
      await buttons.last().click();
      await panel.locator('[data-vacancy-snapshot="https://hh.ru/vacancy/'+(9000+count-1)+'"]').waitFor();
    };
    for (const locale of ['en','ru','zh','hi']) {
      await page.evaluate(value => localStorage.setItem('metaSovereignLocale',value),locale);
      await page.reload();await select();
    }
    await page.evaluate(() => localStorage.setItem('metaSovereignLocale','en'));
    await page.reload();await select();
    const snapshot = panel.locator('[data-vacancy-snapshot]');
    if (!(await snapshot.innerText()).includes('Private corpus entry '+(count-1))) throw Error('Missing full description');
    for (const phone of [false,true]) {
      await page.setViewportSize(phone?{width:390,height:900}:{width:1180,height:950});
      await snapshot.scrollIntoViewIfNeeded();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
      await page.screenshot({path:'docs/screenshots/issue-56-vacancy-corpus/cache-${phase}-'+(phone?'phone':'desktop')+'.png'});
    }
    const receipt = await (await page.request.get(${JSON.stringify(stats)})).json();
    if (errors.length || writes.length || receipt.opens || receipt.clicks || !receipt.closed || receipt.seeded!==101) throw Error(JSON.stringify({errors,writes,receipt}));
    return {phase:${JSON.stringify(phase)},visible:count,locales:4,recoveryReplayed:false,desktopAndPhoneFit:true,errors,writes,...receipt};
  } finally { await cdp.detach(); }
}`;
await writeFile(`ci-logs/vacancy-corpus-mcp-${phase}-code.js`, code);
