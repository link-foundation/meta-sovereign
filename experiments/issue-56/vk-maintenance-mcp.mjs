import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const kind = process.argv[3];
if (!['cleanup', 'outgoing'].includes(kind)) {
  throw new Error('cleanup or outgoing required');
}
// The generated callback is self-contained; the selected feature is supplied.
const check = async (page, { panel, ready, feature }) => {
  const name = feature.slice(3);
  const enabled = panel.locator(`[data-action=vk-${name}-enabled]`);
  const previous = await enabled.isChecked();
  await enabled.click();
  await ready();
  const priority = panel.locator(`[data-${name}-field=priorityIds]`);
  const target = Number((await priority.inputValue()) || 99) + 1;
  await priority.fill(String(target));
  await panel.locator(`[data-${name}-field=limit]`).fill('1');
  await panel.locator(`[data-action=vk-${name}-save]`).click();
  await ready();
  await panel.locator(`[data-action=vk-${name}-plan]`).click();
  await ready();
  await panel.locator(`[data-vk-${name}-plan=review]`).waitFor();
  await panel.locator(`[data-action=vk-${name}-run]`).click();
  await ready();
  await panel.locator(`[data-vk-${name}-status=confirmed]`).waitFor();
  await page.reload();
  await ready();
  if (
    (await enabled.isChecked()) === previous ||
    (await priority.inputValue()) !== String(target)
  ) {
    throw new Error('Acknowledged policy lost');
  }
  await panel.locator(`[data-vk-${name}-status=confirmed]`).waitFor();
  return {
    focus: `[data-vk-${name}-status]`,
    reviewed: true,
    acknowledged: true,
    savedChoiceRetained: true,
  };
};
await mkdir(`docs/screenshots/issue-56-vk-${kind}`, { recursive: true });
await writeVkConnectionInspection(
  `vk-${kind}`,
  kind === 'cleanup' ? 'vkCleanup' : 'vkOutgoing',
  ['hint', 'enabled', 'priorityIds', 'limit', 'plan', 'run'],
  check
);
