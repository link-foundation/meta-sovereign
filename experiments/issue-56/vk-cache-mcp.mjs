import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready, fixture }) => {
  const action = async (name) => {
    await panel.locator(`[data-cache-action=${name}]`).click();
    await ready();
  };
  await panel.locator('[data-cache-field=accountId]').fill('1');
  await panel.locator('[data-cache-field=peerId]').fill('42');
  await panel.locator('[data-cache-field=maxPages]').fill('1');
  await action('restart');
  await panel.locator('[data-cache-state=partial]').waitFor();
  const language = await page.evaluate(() =>
    globalThis.localStorage.getItem('metaSovereignLocale')
  );
  await panel
    .locator('[data-cache-field=folder]')
    .fill(`${fixture.exportRoot}/mcp-${language}`);
  await action('export');
  const exported = await panel.locator('[data-cache-exported]').innerText();
  if (!exported.trim() || exported.includes('vkCache.')) {
    throw Error('Missing translated export receipt');
  }
  await page.reload();
  await ready();
  await panel.locator('[data-cache-field=accountId]').fill('1');
  await panel.locator('[data-cache-field=peerId]').fill('42');
  await action('inspect');
  await panel.locator('[data-cache-state=partial]').waitFor();
  return {
    focus: '[data-cache-state]',
    partialCacheRetained: true,
    exportReceipt: exported,
    reloadInspection: true,
  };
};

await mkdir('docs/screenshots/issue-56-vk-cache', { recursive: true });
await writeVkConnectionInspection(
  'vk-cache',
  'vkCache',
  ['hint', 'accountId', 'peerId', 'exportHint'],
  check,
  'vk-cache',
  {
    readySelector: 'input[data-cache-field=accountId]',
    exportRoot: process.argv[3],
  }
);
// The persistent MCP profile reported cache-write failures for app.min.js.
// Disable only Chromium's HTTP cache for this independent fixture inspection.
const file = 'ci-logs/vk-cache-mcp-code.js';
const inspect = await readFile(file, 'utf8');
await writeFile(
  file,
  `async (page) => {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    return await (${inspect})(page);
  } finally {
    await session.detach();
  }
}`
);
