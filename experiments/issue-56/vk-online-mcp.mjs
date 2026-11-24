import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready }) => {
  const enabled = panel.locator('[data-action=vk-online-enabled]');
  const previous = await enabled.isChecked();
  await enabled.click();
  await ready();
  if ((await enabled.isChecked()) === previous) {
    throw Error('Save acknowledgement missing');
  }
  const running = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/vk/online/run') &&
      response.request().method() === 'POST'
  );
  await panel.locator('[data-action=vk-online-run]').click();
  if ((await running).status() !== 200) {
    throw Error('Online action was not acknowledged');
  }
  await ready();
  await panel.locator('[data-vk-online-status=confirmed]').waitFor();
  await page.reload();
  await ready();
  if ((await enabled.isChecked()) === previous) {
    throw Error('Saved choice lost');
  }
  await panel.locator('[data-vk-online-status=confirmed]').waitFor();
  return {
    focus: '[data-vk-online-status]',
    acknowledged: true,
    savedChoiceRetained: true,
  };
};

await writeVkConnectionInspection(
  'vk-online',
  'vkOnline',
  ['hint', 'enabled', 'minutes', 'run'],
  check
);
