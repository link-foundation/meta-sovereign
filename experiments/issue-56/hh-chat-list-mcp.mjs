/** Serialize current production code for the MCP VM, which disallows imports. */
import { writeFile } from 'node:fs/promises';
import { extractChats } from '../../js/src/sources/browser-actions.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { hhChatListHtml } from './hh-chat-list-fixture.mjs';
await writeFile(
  'ci-logs/hh-chat-list-mcp-script.mjs',
  `async (page) => {
  await page.route('**/*', route => route.fulfill({contentType: 'text/html', body: ${JSON.stringify(hhChatListHtml)}}));
  await page.goto('https://hh.ru/chat');
  const rows = await page.evaluate(${extractChats.toString()}, ${JSON.stringify({ ...HH_WEB_UI.chats, limit: 2 })});
  if (JSON.stringify(rows.map(row => [row.chat, row.unread])) !== '[["7",3],["8",1]]') {
    throw new Error('Native identity/unread mismatch');
  }
  return { rows, url: page.url(), clicked: false, liveProvider: false };
}`
);
