import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready, words }) => {
  const speed = panel.locator('[data-action=vk-queue-speed]');
  await speed.fill('750');
  await panel.getByRole('button', { name: words.save, exact: true }).click();
  await ready();
  await page.reload();
  await ready();
  if ((await speed.inputValue()) !== '750') {
    throw Error('Speed did not survive reload');
  }
  await panel.locator('details').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.open = true;
    })
  );
  if ((await panel.locator('[data-vk-queue-receipt]').count()) !== 1) {
    throw Error('Missing queue receipt');
  }
  const text = await panel.innerText();
  if (text.includes('vkQueue.')) {
    throw Error('Untranslated queue state');
  }
  return {
    focus: '[data-vk-queue-receipt]',
    retainedSettings: true,
    providerFreeInspection: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-queue', { recursive: true });
await writeVkConnectionInspection(
  'vk-send-queue',
  'vkQueue',
  ['hint', 'speed', 'save'],
  check,
  'vk-queue'
);

const path = 'ci-logs/vk-queue-mcp-code.js';
const inspection = await readFile(path, 'utf8');
await writeFile(
  path,
  `async (page) => {
  const session = await page.context().newCDPSession(page);
  const consoleErrors = [];
  const requestFailures = [];
  page.on('console', (entry) => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  try {
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    return { ...await (${inspection})(page), consoleErrors, requestFailures };
  } finally {
    await session.detach();
  }
}`
);
