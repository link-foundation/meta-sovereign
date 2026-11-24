import { readFile, writeFile } from 'node:fs/promises';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { dictionaries } from '../../js/src/web/locales/index.js';

const { base } = JSON.parse(
  await readFile('ci-logs/diagnostics-mcp-server.json', 'utf8')
);
const words = Object.fromEntries(
  Object.entries(dictionaries).map(([language, dictionary]) => [
    language,
    {
      copied: dictionary['diagnostics.copied'],
      refused: dictionary['diagnostics.copyFailed'],
      live: dictionary['diagnostics.live'],
    },
  ])
);
await writeFile(
  'ci-logs/desktop-clipboard-mcp-code.js',
  `async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(({key, version}) => {
    localStorage.setItem(key, JSON.stringify({off:true,v:version}));
    globalThis.fixtureBridgeWrites = 0;
    globalThis.fixtureBrowserWrites = 0;
    globalThis.metaSovereignShell = {platform:'electron',discoveryCandidates:[],copyText:async(text)=>{
      globalThis.fixtureBridgeWrites++;
      if(globalThis.fixtureCopyDenied) return {ok:false};
      globalThis.fixtureExactVisible = text === document.querySelector('.diagnostic-log-text').textContent;
      return {ok:true};
    }};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{globalThis.fixtureBrowserWrites++;throw Error('fixture refusal')}}});
  }, ${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)});
  const result = [];
  for (const [language,words] of Object.entries(${JSON.stringify(words)})) {
    await page.evaluate((language)=>localStorage.setItem('metaSovereignLocale',language), language);
    await page.setViewportSize({width:1180,height:950});
    await page.goto(${JSON.stringify(base)}+'/?clipboard-review='+language+'#settings');
    const panel=page.locator('.diagnostics-settings');
    await panel.locator('[data-action=diagnostics-open]').click();
    await panel.getByText(words.live,{exact:true}).waitFor();
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel.getByText(words.copied,{exact:true}).waitFor();
    if(!await page.evaluate(()=>globalThis.fixtureExactVisible && globalThis.fixtureBridgeWrites===1 && globalThis.fixtureBrowserWrites===0))throw Error('desktop receipt mismatch');
    for(const phone of [false,true]) {
      await page.setViewportSize(phone?{width:390,height:844}:{width:1180,height:950});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await panel.evaluate(e=>{e.scrollIntoView({block:'start'});scrollBy(0,-64)});
      if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('horizontal overflow');
      await page.screenshot({path:'docs/screenshots/issue-56-desktop-clipboard/mcp-'+language+(phone?'-phone':'')+'.png'});
    }
    await page.evaluate(()=>{globalThis.fixtureCopyDenied=true});
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel.getByText(words.refused,{exact:true}).waitFor();
    if(await page.evaluate(()=>globalThis.fixtureBrowserWrites)!==0)throw Error('silent fallback');
    await panel.locator('[data-action=diagnostics-open]').click();
    await panel.locator('[data-diagnostic-logs]').waitFor({state:'detached'});
    result.push({language,exactVisibleLog:true,desktopReceipt:true,refusalVisible:true,desktopAndPhoneFit:true});
  }
  if(errors.length)throw Error(JSON.stringify(errors));
  return {result,errors,liveProvider:false,nativeIPC:false};
}`
);
const code = await readFile('ci-logs/desktop-clipboard-mcp-code.js', 'utf8');
await writeFile(
  'ci-logs/desktop-clipboard-mcp-code.js',
  `async (page) => {
  const session = await page.context().newCDPSession(page);
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', entry => {if(entry.type()==='error') consoleErrors.push(entry.text())});
  page.on('requestfailed', request => requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  try {
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled',{cacheDisabled:true});
    return {...await (${code})(page),consoleErrors,requestFailures};
  } finally {await session.detach()}
}`
);
