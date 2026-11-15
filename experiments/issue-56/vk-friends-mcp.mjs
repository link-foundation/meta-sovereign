import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready }) => {
  const enabled = panel.locator('[data-action=vk-friends-enabled]');
  const previous = await enabled.isChecked();
  await enabled.click();
  await ready();
  const priority = panel.locator('[data-friend-field=priorityIds]');
  const target = Number((await priority.inputValue()) || 99) + 1;
  await priority.fill(String(target));
  await panel.locator('[data-friend-field=maxFriends]').fill('2');
  await panel.locator('[data-friend-field=batchSize]').fill('1');
  await panel.locator('[data-action=vk-friends-save]').click();
  await ready();
  await panel.locator('[data-action=vk-friends-plan]').click();
  await ready();
  await panel.locator('[data-vk-friends-plan=review]').waitFor();
  await panel
    .locator(`[data-friend-id="${target}"][data-friend-reason=eligible]`)
    .waitFor();
  await panel.locator('[data-action=vk-friends-run]').click();
  await ready();
  await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
  await page.reload();
  await ready();
  if (
    (await enabled.isChecked()) === previous ||
    (await priority.inputValue()) !== String(target)
  ) {
    throw Error('Acknowledged policy lost');
  }
  await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
  return {
    focus: '[data-vk-friends-status]',
    reviewed: true,
    acknowledged: true,
    savedChoiceRetained: true,
  };
};
await writeVkConnectionInspection(
  'vk-friends',
  'vkFriends',
  ['hint', 'enabled', 'priorityIds', 'plan', 'run'],
  check
);
