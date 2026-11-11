/** Bundle the current scanner for the MCP VM; no package/build output is changed. */
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { hhChatScanHtml } from './hh-chat-scan-fixture.mjs';

const result = await build({
  stdin: {
    contents:
      "export { scanBrowserChatList } from './js/src/sources/browser-chat-scan.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'chatScanContract',
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
                ? "export const randomUUID = () => 'independent-mcp-scan';"
                : 'export const setTimeout = () => { throw new Error("Use the injected MCP pause"); };',
          })
        );
      },
    },
  ],
});
await writeFile(
  'ci-logs/hh-chat-scan-mcp-script.mjs',
  `async (page) => {
  const process = {env: {}};
  ${result.outputFiles[0].text}
  await page.route('**/*', route => route.fulfill({contentType:'text/html',body:${JSON.stringify(hhChatScanHtml())}}));
  await page.goto('https://hh.ru/chat');
  const document = {evaluate: ({fn,args}) => page.evaluate(fn,args[0])};
  const result = await chatScanContract.scanBrowserChatList(document, ${JSON.stringify(HH_WEB_UI)},
    {waitMs:20,endWaitMs:100,budgetMs:5000}, {now:()=>Date.now(),pause:ms=>page.waitForTimeout(ms)});
  const position = await page.locator('#list').evaluate(node => node.scrollTop);
  if (result.rows.length !== 12 || result.coverage.reason !== 'rendered-end' || !result.restored || position !== 300) {
    throw new Error('Virtual coverage or owned scroll restoration failed');
  }
  return {rows:result.rows.map(row=>row.chat),coverage:result.coverage,restored:result.restored,position,liveProvider:false};
}`
);
