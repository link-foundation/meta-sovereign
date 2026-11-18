import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { questionBrowserProbe } from './question-browser-probe.mjs';

// Generate the bounded native and independent MCP snippets before running.
await import('./vacancy-public-mcp.mjs');
const { default: verify } = await import(
  pathToFileURL(path.resolve('ci-logs/vacancy-public-native.mjs')).href
);
await questionBrowserProbe({}, async (browser) => {
  const context = await browser.newContext();
  try {
    return await verify(await context.newPage());
  } finally {
    await context.close();
  }
});
