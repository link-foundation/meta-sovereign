import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  for (const [key, value] of [
    ['message', 'Hello, friend.'],
    ['limit', '1'],
  ]) {
    await panel.locator(`[data-greet-field=${key}]`).fill(value);
  }
  for (const action of ['save', 'plan']) {
    await panel.locator(`[data-action=vk-greet-${action}]`).click();
    await ready();
  }
  const cooled = await panel.locator('[data-greet-reason=cooldown]').count();
  if (
    !cooled &&
    (await panel
      .locator('[data-greet-id="9"] [data-greet-message]')
      .innerText()) !== 'Hello, friend.'
  ) {
    throw Error('Reviewed greeting mismatch');
  }
  if (!cooled) {
    await panel.locator('[data-action=vk-greet-run]').click();
    await ready();
  }
  await page.reload();
  await ready();
  await panel.locator('[data-action=vk-greet-plan]').click();
  await ready();
  if ((await panel.locator('[data-greet-reason=cooldown]').count()) !== 1) {
    throw Error('Greeting cooldown did not survive reload');
  }
  if (
    (await panel.locator('[data-action=vk-greet-enabled]').isChecked()) ||
    !(await panel.locator('[data-greet-field=onlineOnly]').isChecked())
  ) {
    throw Error('Greeting opt-in defaults changed');
  }
  return {
    focus: '[data-vk-greet-plan]',
    reviewed: true,
    savedText: true,
    cooldown: true,
    automaticOff: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-greet', { recursive: true });
await writeVkConnectionInspection(
  'vk-greet',
  'vkGreet',
  ['hint', 'onlineOnly', 'orderByFriends', 'cooldownDays', 'run'],
  check
);
