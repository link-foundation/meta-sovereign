/** Independently exercise the production text path through Playwright MCP. */
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import {
  textReplyHtml,
  textReplyExpected,
  textReplyBody,
} from './text-reply-fixture.mjs';

const built = await build({
  stdin: {
    contents:
      "export { sendBrowserTextReply } from './js/src/sources/browser-text-reply.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'textContract',
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
                ? "export const randomBytes=()=>({toString:()=>'independenttext'+(++fixtureToken)});"
                : 'export const setTimeout=ms=>fixturePause(ms);',
          })
        );
      },
    },
  ],
});
await writeFile(
  'ci-logs/text-reply-mcp-code.js',
  `async (page) => {
  let fixtureToken=0;
  const fixturePause=ms=>page.waitForTimeout(ms);
  const process={env:{}};
  ${built.outputFiles[0].text}
  const html=${JSON.stringify(textReplyHtml)};
  const expected=${JSON.stringify(textReplyExpected())};
  const text=${JSON.stringify(textReplyBody)};
  const ui=${JSON.stringify(HH_WEB_UI)};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  let beforeClick=null;
  const commander={evaluate:({fn,args})=>page.evaluate(fn,args[0]),clickButton:async({selector})=>{await beforeClick?.();return page.locator(selector).click();}};
  const send=()=>textContract.sendBrowserTextReply(commander,ui,'7',expected,text,{receiptMs:120,pollMs:10});
  const state=()=>page.evaluate(()=>window.textReplyState());
  const screenshot=name=>page.screenshot({path:'docs/screenshots/issue-56-text-reply/mcp-'+name+'.png',fullPage:true});
  const outcomes=[];
  await page.setViewportSize({width:1024,height:850});
  await page.goto('https://hh.ru/chat/7');
  const result=await send(),sent=await state();
  if(result.messageId!=='102'||sent.sends!==1||sent.choices||sent.hooks||sent.draft)throw new Error('Positive receipt failed');
  await screenshot('confirmed-after');outcomes.push({name:'confirmed',result,state:sent});
  await page.setViewportSize({width:390,height:844});
  await page.goto('https://hh.ru/chat/7');
  await page.locator('textarea').fill('Owner draft stays here');
  let code;try{await send();}catch(error){code=error.code;}
  const owner=await state();
  if(code!=='answer-draft-preserved'||owner.sends||owner.hooks||owner.draft!=='Owner draft stays here')throw new Error('Owner draft changed');
  await screenshot('phone-owner-after');outcomes.push({name:'phone-owner',code,state:owner});
  await page.setViewportSize({width:1024,height:850});
  await page.goto('https://hh.ru/chat/7');
  await page.evaluate(()=>{fixture.receipt='none';});
  code=null;try{await send();}catch(error){code=error.code;}
  if(code!=='send-unknown')throw new Error('Missing receipt claimed success');
  let second;try{await send();}catch(error){second=error.code;}
  const unknown=await state();
  if(unknown.sends!==1||unknown.hooks||unknown.draft!==text||!second)throw new Error('Uncertain send repeated');
  await screenshot('unknown-after');outcomes.push({name:'unknown',code,second,state:unknown});
  await page.goto('https://hh.ru/chat/7');
  await page.locator('#status').evaluate(node=>{node.textContent='This conversation is closed';});
  code=null;try{await send();}catch(error){code=error.code;}
  const closed=await state();if(code!=='answer-text-changed'||closed.sends||closed.draft||closed.hooks)throw new Error('Closed chat dispatched');
  outcomes.push({name:'closed',code,state:closed});
  await page.goto('https://hh.ru/chat/7');
  beforeClick=()=>page.locator('[data-qa="chat-bubble-text"]').evaluate(node=>{node.textContent='Owner received a changed request';});
  code=null;try{await send();}catch(error){code=error.code;}
  const changed=await state();if(code!=='answer-text-changed'||changed.sends||changed.hooks||changed.draft)throw new Error('Changed request dispatched');
  outcomes.push({name:'late-change',code,state:changed});
  if(errors.length)throw new Error(JSON.stringify(errors));
  return {outcomes,errors,liveProvider:false,adapters:'Fixture-only token counter and Playwright pause; production dispatch and receipt guards.'};
}`
);
