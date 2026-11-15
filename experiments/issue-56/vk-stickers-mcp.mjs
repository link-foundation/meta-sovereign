import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready, fixture }) => {
  const action = async (name) => {
    await panel.locator(`[data-sticker-action=${name}]`).click();
    await ready();
  };
  await panel.locator('[data-sticker-field=accountId]').fill('1');
  await action('refresh');
  await panel.locator('[data-sticker-field=category]').selectOption('greeting');
  await action('inspect');
  if ((await panel.locator('[data-catalog-sticker]').count()) !== 2) {
    throw Error('Greeting catalog incomplete');
  }
  await panel.locator('details').evaluate((node) => {
    node.open = true;
  });
  await panel
    .locator('[data-sticker-field=received]')
    .fill(JSON.stringify({ 101: { productId: 11 }, 401: { productId: 13 } }));
  await action('filter');
  await panel.locator('[data-filtered-products]').waitFor();
  const language = await page.evaluate(() =>
    globalThis.localStorage.getItem('metaSovereignLocale')
  );
  await panel
    .locator('[data-sticker-field=folder]')
    .fill(`${fixture.exportRoot}/mcp-${language}`);
  await action('export');
  await panel.locator('[data-catalog-exported]').waitFor();
  const receipt = await panel.locator('[data-catalog-exported]').innerText();
  if (!receipt.trim() || receipt.includes('vkStickers.')) {
    throw Error('Missing translated export receipt');
  }
  await page.reload();
  await ready();
  await panel.locator('[data-sticker-field=accountId]').fill('1');
  await action('inspect');
  await panel.locator('[data-usable-greeting-ids]').waitFor();
  return {
    focus: '[data-sticker-catalog-evidence]',
    usableGreetingIds: 2,
    receivedFiltering: true,
    receipt,
    reloadInspection: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-stickers', { recursive: true });
await writeVkConnectionInspection(
  'vk-stickers',
  'vkStickers',
  ['hint', 'accountId', 'exportHint'],
  check,
  'vk-stickers',
  {
    readySelector: 'input[data-sticker-field=accountId]',
    exportRoot: process.argv[3],
  }
);
const file = 'ci-logs/vk-stickers-mcp-code.js';
const inspect = await readFile(file, 'utf8');
await writeFile(
  file,
  `async (page) => {
  const session = await page.context().newCDPSession(page);
  const syntheticPreview = (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><text y="95" font-size="90">👋</text></svg>' });
  try {
    await page.context().route('https://vk.com/sticker/**', syntheticPreview);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    return await (${inspect})(page);
  } finally {
    await page.context().unroute('https://vk.com/sticker/**', syntheticPreview);
    await session.detach();
  }
}`
);
