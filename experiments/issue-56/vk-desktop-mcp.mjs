import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  const choice = panel.locator('[data-friend-field=acceptancePolicy]');
  await choice.selectOption('desktop-ten-percent');
  await ready();
  for (const [key, value] of [
    ['maxFriends', '1'],
    ['batchSize', '2'],
  ]) {
    await panel.locator(`[data-friend-field=${key}]`).fill(value);
  }
  for (const action of ['save', 'plan', 'run']) {
    await panel.locator(`[data-action=vk-friends-${action}]`).click();
    await ready();
    if (action === 'plan') {
      await panel.locator('[data-friend-quota]').waitFor();
    }
  }
  await page.reload();
  await ready();
  await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
  if ((await choice.inputValue()) !== 'desktop-ten-percent') {
    throw new Error('Desktop choice lost');
  }
  return {
    focus: '[data-friend-quota]',
    reviewed: true,
    acknowledged: true,
    savedChoiceRetained: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-desktop', { recursive: true });
await writeVkConnectionInspection(
  'vk-friends',
  'vkFriends',
  ['acceptancePolicy', 'desktopHint', 'plan', 'run'],
  check,
  'vk-desktop'
);
