import { build } from 'esbuild';

/** Bundle only the production scan with finite, explicitly injected Node adapters. */
export const mcpChatScanBundle = async ({ unread = false } = {}) => {
  const result = await build({
    stdin: {
      contents: `export { scanBrowserChatList } from './js/src/sources/browser-chat-scan.js';${
        unread
          ? "export { scanUnreadBrowserConversations } from './js/src/sources/browser-unread-conversations.js'; export { HH_WEB_UI } from './js/src/sources/hh-web-ui.js';"
          : ''
      }`,
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
                  ? "let next = 0; export const randomUUID = () => 'independent-mcp-scan-' + (++next); export const randomBytes = () => { throw new Error('This inspection is read-only'); };"
                  : unread
                    ? 'export const setTimeout = (ms) => mcpPause(ms);'
                    : 'export const setTimeout = () => { throw new Error("Use the injected MCP pause"); };',
            })
          );
        },
      },
    ],
  });
  return result.outputFiles[0].text;
};
