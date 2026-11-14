/** Bundle the production traversal for an independently driven MCP browser. */
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import {
  conversationHistoryHtml,
  conversationHistoryIds,
} from './conversation-history-fixture.mjs';

const result = await build({
  stdin: {
    contents:
      "export { scanBrowserConversation } from './js/src/sources/browser-conversation-history.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'conversationContract',
  plugins: [
    {
      name: 'finite-mcp-adapters',
      setup(builder) {
        builder.onResolve({ filter: /^node:/ }, (args) => ({
          path: args.path,
          namespace: 'finite-mcp',
        }));
        builder.onLoad(
          { filter: /.*/, namespace: 'finite-mcp' },
          ({ path }) => ({
            contents:
              path === 'node:crypto'
                ? "export const randomUUID = () => 'independent-mcp-history'; export const randomBytes = () => { throw new Error('Unexpected choice write'); };"
                : "export const setTimeout = () => { throw new Error('Use injected pause'); };",
          })
        );
      },
    },
  ],
});
const fixtures = Object.fromEntries(
  [
    ['ordinary', {}],
    ['reversed', { reversed: true }],
    ['stalled', { marker: false }],
  ].map(([name, options]) => [name, conversationHistoryHtml(options)])
);
await writeFile(
  'ci-logs/conversation-history-mcp-code.js',
  `async (page) => {
  const process = {env:{}};
  ${result.outputFiles[0].text}
  const fixtures = ${JSON.stringify(fixtures)};
  const expected = ${JSON.stringify(conversationHistoryIds.map(String))};
  const ui = ${JSON.stringify(HH_WEB_UI)};
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*', route => route.fulfill({contentType:'text/html',body:fixtures[new URL(route.request().url()).searchParams.get('fixture')??'ordinary']}));
  const document = {evaluate:({fn,args})=>page.evaluate(fn,args[0])};
  const options={waitMs:30,endWaitMs:100,budgetMs:5000};
  const dependencies={now:()=>Date.now(),pause:ms=>page.waitForTimeout(ms)};
  const snapshot=()=>page.evaluate(()=>{const root=document.querySelector('#history'),composer=document.querySelector('textarea');return {top:root.scrollTop,draft:composer.value,selection:[composer.selectionStart,composer.selectionEnd],live:Boolean(window[Symbol.for('meta-sovereign.browser-conversation-history.v1')]),clicks:window.fixture.clicks,sends:window.fixture.sends};});
  const outcomes=[];
  for(const name of ['ordinary','reversed','stalled']){
    await page.goto('https://hh.ru/chat/7?fixture='+name);
    const before=await snapshot();
    if(name!=='stalled') await page.screenshot({path:'docs/screenshots/issue-56-conversation-history/mcp-'+name+'-before.png',fullPage:true});
    const result=await conversationContract.scanBrowserConversation(document,ui,'7',options,dependencies);
    const after=await snapshot();
    if(JSON.stringify(result.rows.map(row=>row.id))!==JSON.stringify(expected)||JSON.stringify(before)!==JSON.stringify(after)||!result.restored||result.coverage.complete!==(name!=='stalled')||!result.rows[2].outgoing) throw new Error('History coverage or owner preservation failed: '+name);
    await page.locator('#result').evaluate((node,result)=>{node.textContent=JSON.stringify({rows:result.rows.map(row=>row.id),manualReplyFound:result.rows[2].outgoing,...result.coverage,restored:result.restored},null,2);},result);
    if(name!=='stalled') await page.screenshot({path:'docs/screenshots/issue-56-conversation-history/mcp-'+name+'-after.png',fullPage:true});
    outcomes.push({name,coverage:result.coverage,restored:result.restored,owner:after});
  }
  await page.goto('https://hh.ru/chat/7?fixture=ordinary');
  let changed=false;
  const result=await conversationContract.scanBrowserConversation(document,ui,'7',options,{now:()=>Date.now(),pause:async ms=>{await page.waitForTimeout(ms);if(!changed){changed=true;await page.locator('textarea').fill('New owner draft');}}});
  const owner=await snapshot();
  if(result.coverage.reason!=='owner-active'||result.restored||result.rows.length||owner.draft!=='New owner draft'||owner.live||owner.clicks||owner.sends||errors.length) throw new Error('Owner interruption or browser error');
  await page.screenshot({path:'docs/screenshots/issue-56-conversation-history/mcp-owner-after.png',fullPage:true});
  outcomes.push({name:'owner-input',coverage:result.coverage,restored:result.restored,owner});
  return {outcomes,errors,liveProvider:false};
}`
);
