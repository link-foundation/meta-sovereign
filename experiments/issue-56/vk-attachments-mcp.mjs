import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready }) => {
  const enabled = panel.locator('[data-action=vk-attachments-enabled]');
  await ready();
  const previous = await enabled.isChecked();
  const changing = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/vk/attachments') &&
      response.request().method() === 'POST'
  );
  await enabled.click();
  if ((await changing).status() !== 200) {
    throw Error('Collection configuration was not acknowledged');
  }
  await page.waitForFunction((checked) => {
    const input = document.querySelector(
      '[data-action=vk-attachments-enabled]'
    );
    return input && !input.disabled && input.checked === checked;
  }, !previous);
  await page.reload();
  await ready();
  if (
    (await enabled.isChecked()) === previous ||
    (await panel.locator('[data-vk-attachment]').count()) !== 3
  ) {
    throw Error('Acknowledged configuration or saved metadata lost on reload');
  }
  const photo = panel.locator(
    '[data-vk-attachment="attachment:vk:photo:41:11"]'
  );
  await photo.locator('summary').click();
  const text = await photo.locator('pre').textContent();
  if (
    !text.includes('First <script>fixture</script> 元数据') ||
    (await photo.locator('script').count())
  ) {
    throw Error('First metadata must remain literal text');
  }
  return {
    focus: 'details[open]',
    retainedRecords: 3,
    savedChoiceRetained: true,
    literalMetadata: true,
  };
};

await writeVkConnectionInspection(
  'vk-attachments',
  'vkAttachments',
  ['hint', 'enabled'],
  check
);
