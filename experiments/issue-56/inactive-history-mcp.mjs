/** Drive the production owned reader independently through Playwright MCP. */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { conversationHistoryHtml } from './conversation-history-fixture.mjs';

const result = await build({
  stdin: {
    contents:
      "export { openBrowserAnswerWatch } from './js/src/sources/browser-answer-watch.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'inactiveContract',
  // MCP omits performance; use its wall clock within the existing finite budget.
  define: { 'globalThis.performance.now': 'Date.now' },
  plugins: [
    {
      name: 'read-only-mcp-adapters',
      setup(builder) {
        builder.onResolve({ filter: /^node:/ }, (args) => ({
          path: args.path,
          namespace: 'mcp-reader',
        }));
        builder.onLoad(
          { filter: /.*/, namespace: 'mcp-reader' },
          ({ path }) => ({
            contents:
              path === 'node:crypto'
                ? "export const randomUUID = () => 'independent-inactive-history'; export const randomBytes = () => { throw new Error('Unexpected write'); };"
                : 'export const setTimeout = ms => page.waitForTimeout(ms);',
          })
        );
      },
    },
  ],
});
const screenshots = resolve('docs/screenshots/issue-56-inactive-history');
await mkdir(screenshots, { recursive: true });
await writeFile(
  'ci-logs/inactive-history-mcp-code.js',
  `async (page) => {
  const process = {env:{}};
  ${result.outputFiles[0].text}
  const ui=${JSON.stringify(HH_WEB_UI)}, html=${JSON.stringify(conversationHistoryHtml())};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://hh.ru/chat/7');
  await page.bringToFront();
  let released=0,interrupt=false,owner;
  const snapshot=()=>page.evaluate(()=>({
    top:document.querySelector('#history').scrollTop,
    draft:document.querySelector('textarea').value,
    selection:[document.querySelector('textarea').selectionStart,document.querySelector('textarea').selectionEnd],
    lease:Boolean(window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]),
    history:Boolean(window[Symbol.for('meta-sovereign.browser-conversation-history.v1')]),
    sends:window.fixture.sends,
  }));
  const commander={evaluate:async ({fn,args})=>{
    const value=await page.evaluate(fn,args[0]);
    if(interrupt&&args[0]?.operation==='history'){
      interrupt=false;await page.bringToFront();owner=await snapshot();
    }
    return value;
  }};
  const handle=await inactiveContract.openBrowserAnswerWatch({
    commander,page,ui,target:'7',queue:work=>work(),released:()=>released++,
  });
  const outcomes=[];
  let other;
  try{
    const before=await snapshot();
    let refusal;
    try{await handle.readInactiveHistory({endWaitMs:100});}catch(error){refusal=error.code;}
    if(refusal!=='browser-background-owner-active'||JSON.stringify(before)!==JSON.stringify(await snapshot())) throw new Error('Focused view must remain unchanged');
    outcomes.push({name:'focused-refusal',refusal});
    await page.locator('#result').evaluate((node,value)=>node.textContent=JSON.stringify(value,null,2),outcomes[0]);
    await page.screenshot({path:${JSON.stringify(`${screenshots}/mcp-focused-refusal.png`)},fullPage:true});
    other=await page.context().newPage();await other.bringToFront();
    const receipt=await handle.readInactiveHistory({endWaitMs:100});
    const after=await snapshot();
    if(!receipt.coverage.complete||receipt.rows.length!==12||!receipt.restored||JSON.stringify(after)!==JSON.stringify(before)) throw new Error('Inactive history must preserve the exact owner view');
    outcomes.push({name:'inactive-complete',coverage:receipt.coverage,restored:receipt.restored,owner:after});
    await page.locator('#result').evaluate((node,value)=>node.textContent=JSON.stringify(value,null,2),outcomes[1]);
    await page.screenshot({path:${JSON.stringify(`${screenshots}/mcp-restored.png`)},fullPage:true});
    await other.bringToFront();interrupt=true;refusal=null;
    try{await handle.readInactiveHistory({endWaitMs:100});}catch(error){refusal=error.code;}
    const preserved=await snapshot();
    if(refusal!=='browser-background-owner-active'||JSON.stringify(preserved)!==JSON.stringify({...owner,lease:false,history:false})||preserved.sends) throw new Error('Returning owner must retain the current view');
    outcomes.push({name:'owner-return',refusal,owner:preserved});
    await page.locator('#result').evaluate((node,value)=>node.textContent=JSON.stringify(value,null,2),outcomes[2]);
    await page.screenshot({path:${JSON.stringify(`${screenshots}/mcp-owner-return.png`)},fullPage:true});
  }finally{await handle.close();await other?.close();}
  if(released!==1||errors.length) throw new Error('Owned reader must close without browser errors');
  return {cases:outcomes.length,outcomes,released,pageErrors:errors,liveProvider:false};
}`
);
