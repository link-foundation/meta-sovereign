/** Independently drive the production owned write/receipt path through MCP. */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { textReplyHtml, textReplyBody } from './text-reply-fixture.mjs';
import { hhChatScanOwner } from './hh-chat-scan-fixture.mjs';

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
  plugins: [
    {
      name: 'mcp-node-adapters',
      setup(builder) {
        builder.onResolve({ filter: /^node:/ }, (args) => ({
          path: args.path,
          namespace: 'mcp',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'mcp' }, ({ path }) => ({
          contents:
            path === 'node:crypto'
              ? 'export const randomUUID = () => mcpCrypto.randomUUID(); export const randomBytes = n => mcpCrypto.randomBytes(n);'
              : 'export const setTimeout = ms => page.waitForTimeout(ms);',
        }));
      },
    },
  ],
});
const screenshots = resolve('docs/screenshots/issue-56-inactive-text');
await mkdir(screenshots, { recursive: true });
await writeFile(
  'ci-logs/inactive-text-mcp-code.js',
  `async (page) => {
  const mcpCrypto = {randomUUID:()=>crypto.randomUUID(),randomBytes:n=>Buffer.from(crypto.getRandomValues(new Uint8Array(n)))};
  const process = {env:{}};
  ${result.outputFiles[0].text}
  const ui=${JSON.stringify(HH_WEB_UI)}, html=${JSON.stringify(textReplyHtml)}, text=${JSON.stringify(textReplyBody)};
  const ownerHtml=${JSON.stringify(hhChatScanOwner([{ url: 'https://chatik.hh.ru/chat/7' }]))};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let framed=false,released=0;
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:framed&&new URL(route.request().url()).hostname==='hh.ru'?ownerHtml:html}));
  const state=frame=>frame.evaluate(()=>({...window.textReplyState(),focused:document.hasFocus(),lease:Boolean(window[Symbol.for('meta-sovereign.browser-inactive-view.v1')])}));
  const commander={
    evaluate:({fn,args})=>page.evaluate(fn,args[0]),
    clickButton:({selector})=>page.locator(selector).evaluate(node=>node.click()),
  };
  const open=()=>inactiveContract.openBrowserAnswerWatch({commander,page,ui,target:'7',receiptMs:100,pollMs:10,queue:work=>work(),released:()=>released++});
  const outcomes=[];
  let handle,other;
  try{
    await page.goto('https://hh.ru/chat/7');await page.bringToFront();
    handle=await open();let expected=await handle.read();
    const before=await state(page);
    let code;
    try{await handle.replyTextInactive(expected,text);}catch(error){code=error.code;}
    if(code!=='browser-background-owner-active'||JSON.stringify(before)!==JSON.stringify(await state(page)))throw new Error('Focused provider changed');
    outcomes.push({name:'focused-no-write',code});
    other=await page.context().newPage();await other.setContent('<textarea>Active owner draft</textarea>');await other.bringToFront();
    await other.locator('textarea').evaluate(node=>node.setSelectionRange(2,8));
    const active=()=>other.evaluate(()=>({focused:document.hasFocus(),value:document.querySelector('textarea').value,selection:[document.querySelector('textarea').selectionStart,document.querySelector('textarea').selectionEnd]}));
    const owner=await active();
    const receipt=await handle.replyTextInactive(expected,text);
    const after=await state(page);
    if(receipt.messageId!=='102'||after.sends!==1||after.focused||after.lease||after.hooks||JSON.stringify(owner)!==JSON.stringify(await active()))throw new Error('Inactive receipt or owner preservation failed');
    outcomes.push({name:'inactive-receipt',receipt,after,owner});
    await page.screenshot({path:${JSON.stringify(`${screenshots}/mcp-after.png`)},fullPage:true});
    await other.screenshot({path:${JSON.stringify(`${screenshots}/mcp-owner.png`)},fullPage:true});
    await handle.close();handle=null;
    framed=true;await page.goto('https://hh.ru/chat/7');
    handle=await open();expected=await handle.read();await other.bringToFront();
    const child=page.frames().find(frame=>frame!==page.mainFrame());
    const locate=child.locator.bind(child);
    child.locator=(selector,options)=>{
      const locator=locate(selector,options);
      if(selector.startsWith('[data-meta-answer-choice=')){
        const evaluate=locator.evaluate.bind(locator);
        locator.evaluate=async(...args)=>{await page.bringToFront();return evaluate(...args);};
      }
      return locator;
    };
    code=null;try{await handle.replyTextInactive(expected,text);}catch(error){code=error.code;}
    const guarded=await state(child);
    if(code!=='answer-text-changed'||guarded.sends||guarded.focused||guarded.hooks||guarded.lease)throw new Error('Embedded final ownership guard failed');
    outcomes.push({name:'embedded-outer-return',code,after:guarded});
    await page.screenshot({path:${JSON.stringify(`${screenshots}/mcp-owner-return.png`)},fullPage:true});
  }finally{await handle?.close();await other?.close();}
  if(released!==2||errors.length)throw new Error('Owned writes did not drain cleanly');
  return {cases:outcomes.length,outcomes,released,pageErrors:errors,liveProvider:false};
}`
);
