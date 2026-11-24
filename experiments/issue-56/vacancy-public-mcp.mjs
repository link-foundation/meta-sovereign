/** A finite, anonymous read of one current public HH vacancy; never clicks. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAssignmentVacancyDocument } from '../../js/src/assignments/vacancy-reader.js';

const root = process.cwd();
// Manual source observation only. Automated checks use the synthetic fixture.
const sourceUrl = process.env.HH_PUBLIC_SOURCE_URL;
if (!/^https:\/\/hh\.ru\/vacancy\/\d+$/u.test(sourceUrl ?? '')) {
  throw new Error(
    'Set HH_PUBLIC_SOURCE_URL to one canonical public HH vacancy'
  );
}
const entry = (file) => pathToFileURL(path.join(root, file)).href;
const output = path.join(root, 'ci-logs/vacancy-public-mcp-code.js');
const screenshot = path.join(
  root,
  'docs/screenshots/issue-56-vacancy-modern/public-native.png'
);
const code = `async (page) => {
  const {openBrowserSession} = await import(${JSON.stringify(entry('js/src/cv/browser.js'))});
  const {createBrowserStore,createInMemoryDriver} = await import(${JSON.stringify(entry('js/src/storage/browser-store.js'))});
  const {createVacancyService} = await import(${JSON.stringify(entry('js/src/jobs/service.js'))});
  const {createVacancyCommands} = await import(${JSON.stringify(entry('js/src/cli/vacancy-commands.js'))});
  const {decodeWire} = await import(${JSON.stringify(entry('js/src/transport/lino.js'))});
  const {readAssignmentVacancyDocument} = await import(${JSON.stringify(entry('js/src/assignments/vacancy-reader.js'))});
  const {mkdtemp,rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const assert = (await import('node:assert/strict')).default;
  const browser = page.context().browser();
  const driver = createInMemoryDriver();
  let store = await createBrowserStore({driver});
  const directory = await mkdtemp(join(tmpdir(),'issue56-public-vacancy-'));
  const records = [], posts = [], errors = [];
  let service, native;
  const url = ${JSON.stringify(sourceUrl)};
  const openSession = async (options) => {
    const record = {closed:false,clicks:0};records.push(record);
    const context = await browser.newContext();
    const source = await context.newPage();
    source.on('pageerror',error=>errors.push(String(error).slice(0,500)));
    await source.addInitScript(() => {
      globalThis.collectionClicks = 0;
      document.addEventListener('click',()=>globalThis.collectionClicks++);
    });
    await context.route('**/*',route => {
      if (route.request().method() === 'POST') {
        posts.push(new URL(route.request().url()).origin);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    // Use the actual application wrapper, including its commander policy.
    const session=await openBrowserSession({...options,launcher:async()=>({page:source,close:()=>context.close()})});
    const {commander}=session;
    const navigate=commander.goto.bind(commander);
    commander.goto=async input=>{try {const value=await navigate(input); console.error(JSON.stringify({event:'public-navigation-observed',navigated:value.navigated,verified:value.verified,status:value.status,reason:value.reason,readiness:value.readiness}));return value;} catch(error) {console.error(JSON.stringify({event:'public-navigation-refused',name:error.name,message:String(error.message).slice(0,1200)}));throw error;}};
    return {page:source,commander,close:async()=>{
      try {
        native = await source.evaluate(readAssignmentVacancyDocument);
        record.clicks = await source.evaluate(()=>globalThis.collectionClicks);
        await source.screenshot({path:${JSON.stringify(screenshot)},fullPage:false});
      } catch(error) {console.error(JSON.stringify({event:'public-capture-refused',name:error.name,message:String(error.message).slice(0,1200)}));}
      finally {await session.close();record.closed=true;}
    }};
  };
  const make = () => createVacancyService({store,storeDir:directory,legacyVacancyDirectories:[],openSession});
  try {
    service = make();
    const first = await service.collect({url,browserSlot:'public-collection',headless:true});
    assert.equal(records.length,1);assert.equal(records[0].closed,true);
    assert.equal(first.url,url);assert.equal(first.description,native.description);
    assert.equal(first.descriptionHtml,native.descriptionHtml);
    assert.ok(first.description.length > 1000);
    assert.equal(first.status,'encountered');
    const reused = await service.collect({url:url+'?from=search',browserSlot:'public-collection',headless:true});
    assert.deepEqual(reused,first);assert.equal(records.length,1);
    await service.stop();await store.close();
    store = await createBrowserStore({driver});service = make();
    const recovered = (await service.stored()).entries;
    assert.equal(recovered.length,1);assert.equal(recovered[0].description,first.description);
    assert.equal(recovered[0].descriptionHtml,first.descriptionHtml);
    const cli=[];
    const commands=createVacancyCommands({openStore:async()=>store,legacyVacancyDirectories:[],openSession:()=>assert.fail('Cache recovery opened a provider')});
    assert.equal(await commands['vacancies-stored']({},text=>cli.push(decodeWire(text))),0);
    assert.deepEqual(cli[0].entries,recovered);
    return {source:url,anonymous:true,liveProvider:true,opened:records.length,allClosed:records.every(r=>r.closed),clicks:records.reduce((n,r)=>n+r.clicks,0),descriptionCharacters:first.description.length,descriptionHtmlCharacters:first.descriptionHtml.length,skills:first.skills.length,fields:Object.keys(first).filter(k=>first[k] && !['id','tokens','children','description','descriptionHtml'].includes(k)),fullDomTextEqual:true,exactPrivateHtmlEqual:true,canonicalAliasReused:true,reopenedStoreEqual:true,cliEqual:true,blockedPostOrigins:[...new Set(posts)],pageErrors:errors,issueComplete:false};
  } finally {await service?.stop();await store.close();await rm(directory,{recursive:true,force:true});}
}`;
await writeFile(
  path.join(root, 'ci-logs/vacancy-public-native.mjs'),
  `export default ${code};\n`
);
await writeFile(
  output,
  `async (page) => {
    await page.goto(${JSON.stringify(sourceUrl)}, {waitUntil:'domcontentloaded'});
    await page.locator('[data-qa="vacancy-description"]').waitFor({timeout:20000});
    const read = await page.evaluate(${readAssignmentVacancyDocument.toString()});
    const visible = await page.locator('[data-qa="vacancy-description"]').innerText();
    const html = await page.locator('[data-qa="vacancy-description"]').innerHTML();
    if(read.challenge || !read.title || read.description !== visible.trim() || read.descriptionHtml !== html || read.description.length < 1000) throw Error('Public collection mismatch');
    await page.screenshot({path:${JSON.stringify(screenshot.replace('public-native.png', 'public-source-after.png'))}});
    return {source:read.url,anonymous:true,liveProvider:true,descriptionCharacters:read.description.length,descriptionHtmlCharacters:read.descriptionHtml.length,skills:read.skills.length,employment:read.employment,published:read.published,fullDomTextEqual:true,exactPrivateHtmlEqual:true,issueComplete:false};
  }`
);
process.stdout.write(`${output}\n`);
