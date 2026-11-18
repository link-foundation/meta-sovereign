import { readFile, writeFile } from 'node:fs/promises';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const log = await readFile('ci-logs/discovery-memory-mcp-server.log', 'utf8');
const { base, stats } = JSON.parse(
  log.split('\n').find((line) => line.startsWith('{"base":'))
);
const code = `async(originalPage) => {
  const context=await originalPage.context().browser().newContext({viewport:{width:1180,height:950}});
  try {
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.addInitScript(({key,version})=>{
      localStorage.setItem(key,JSON.stringify({off:true,v:version}));
      if(!localStorage.getItem('metaSovereignLocale')) localStorage.setItem('metaSovereignLocale','en');
    },${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
    await page.goto(${JSON.stringify(base)}+'/#/cv');
    const panel=page.locator('[data-vacancies]');
    const discovery=panel.locator('[data-vacancy-discovery]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await discovery.locator('[data-discovery-field="collectVacancies"]').uncheck();
    await discovery.locator('[data-discovery-field="collectVacancies"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:'docs/screenshots/issue-56-discovery-memory/after/mcp-controls.png'});
    await discovery.locator('[data-discovery-action="start"]').click();
    for(const id of ['123','124','125']) await discovery.locator('[data-discovery-card="https://hh.ru/vacancy/'+id+'"]').waitFor();
    const complete=discovery.locator('[data-discovery-phase="completed"]');await complete.waitFor();
    const memory=discovery.locator('[data-discovery-collection="memory"]');await memory.waitFor();
    if(await discovery.locator('[data-discovery-card]').count()!==3) throw Error('Incomplete discovery');
    await memory.scrollIntoViewIfNeeded();
    await page.screenshot({path:'docs/screenshots/issue-56-discovery-memory/after/mcp-desktop.png'});
    await page.reload();await memory.waitFor();
    const batch=panel.locator('[data-application-batch]');
    await batch.locator('[data-application-batch-action="use-discovery"]').click();
    if(await panel.locator('[data-application-option="collectVacancies"]').isChecked()) throw Error('Handoff changed storage setting');
    if(!await batch.locator('[data-application-batch-action="start"]').isDisabled()) throw Error('Handoff armed a batch');
    for(const locale of ['ru','hi','zh','en']) {
      await page.evaluate(locale=>localStorage.setItem('metaSovereignLocale',locale),locale);
      await page.reload();await memory.waitFor();
      if(await page.locator('select[data-locale]').inputValue()!==locale || /\\bdiscovery\\.[a-z]/u.test(await discovery.innerText())) throw Error('Locale was not applied');
    }
    await page.setViewportSize({width:390,height:950});await memory.scrollIntoViewIfNeeded();
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)) throw Error('Phone overflow');
    await page.screenshot({path:'docs/screenshots/issue-56-discovery-memory/after/mcp-phone.png'});
    const receipt=await(await page.request.get(${JSON.stringify(stats)})).json();
    if(receipt.savedDescriptions!==0 || receipt.temporaryDescriptions!==2 || receipt.opens!==4 || receipt.clicks!==0 || !receipt.closed || errors.length || receipt.errors.length) throw Error(JSON.stringify({errors,receipt}));
    return {memoryOnly:true,locales:4,batchArmed:false,recoveryReplayed:false,errors,...receipt};
  } finally { await context.close(); }
}`;
await writeFile('ci-logs/discovery-memory-mcp-code.js', code);
