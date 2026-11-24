import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const input = await readFile(
  'ci-logs/vacancy-modern-mcp-final-server.log',
  'utf8'
);
const { base, stats } = JSON.parse(
  input.split('\n').find((line) => line.startsWith('{"base":'))
);
await mkdir('docs/screenshots/issue-56-vacancy-modern/after', {
  recursive: true,
});
const code = `async(page) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(({key,version})=>{
    localStorage.setItem(key,JSON.stringify({off:true,v:version}));
    localStorage.setItem('metaSovereignLocale','en');
  },${JSON.stringify({ key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION })});
  await page.goto(${JSON.stringify(base)}+'/#/cv');
  const panel=page.locator('[data-vacancies]');
  await panel.locator('[data-vacancy-field="query"]').fill('Python');
  await panel.locator('[data-vacancy-action="search"]').click();
  await panel.locator('[data-vacancy-card]').first().waitFor();
  await panel.locator('[data-vacancy-action="collect"]').first().click();
  const snapshot=panel.locator('[data-vacancy-snapshot]');
  await snapshot.waitFor();
  const verify=async()=>{
    const fields=await snapshot.locator('p.meta').allTextContents();
    if(!fields.some(s=>s.endsWith(': Полная занятость')) || !fields.some(s=>s.endsWith(': Вакансия опубликована 13 ноября 2026 в Ташкенте'))) throw Error('Native metadata missing from saved fields');
  };
  await verify();
  for(const locale of ['ru','zh','hi','en']) {
    await page.evaluate(locale=>localStorage.setItem('metaSovereignLocale',locale),locale);
    await page.reload();
    await panel.getByRole('button',{name:'Python engineer',exact:true}).click();
    await snapshot.waitFor();await verify();
  }
  for(const phone of [false,true]) {
    await page.setViewportSize(phone?{width:390,height:844}:{width:1180,height:950});
    await snapshot.scrollIntoViewIfNeeded();
    if(!await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
    await page.screenshot({path:'docs/screenshots/issue-56-vacancy-modern/after/mcp-'+(phone?'phone':'desktop')+'.png'});
  }
  const receipt=await(await page.request.get(${JSON.stringify(stats)})).json();
  if(errors.length||receipt.errors.length||receipt.opens!==2||receipt.clicks!==0||!receipt.closed) throw Error(JSON.stringify({errors,receipt}));
  return {modernMetadata:true,cacheRecovered:true,locales:4,desktopAndPhoneFit:true,pageErrors:errors,...receipt};
}`;
await writeFile('ci-logs/vacancy-modern-mcp-code.js', code);
