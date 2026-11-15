import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  for (const [key, value] of [
    ['communities', '42'],
    ['messages', 'Add me as a friend: owner invitation'],
    ['attachments', 'audio-1_23'],
  ]) {
    await panel.locator(`[data-wall-field=${key}]`).fill(value);
  }
  await panel.locator('[data-wall-field=replaceOwned]').check();
  for (const action of ['save', 'plan']) {
    await panel.locator(`[data-action=vk-wall-${action}]`).click();
    await ready();
  }
  const visible = await panel.locator('[data-wall-reason=visible]').count();
  if (!visible) {
    const review = await panel.locator('[data-vk-wall-plan]').innerText();
    if (
      !review.includes('audio-1_23') ||
      !review.includes('Add me as a friend: owner invitation')
    ) {
      throw Error('Missing native wall review');
    }
    await panel.locator('[data-action=vk-wall-run]').click();
    await ready();
    await panel.locator('[data-vk-wall-status=confirmed]').waitFor();
  }
  await page.reload();
  await ready();
  await panel.locator('[data-action=vk-wall-plan]').click();
  await ready();
  if ((await panel.locator('[data-wall-reason=visible]').count()) !== 1) {
    throw Error('Top-ten duplicate was not held after reload');
  }
  if (await panel.locator('[data-action=vk-wall-enabled]').isChecked()) {
    throw Error('Schedule unexpectedly enabled');
  }
  return {
    focus: '[data-vk-wall-plan]',
    nativeReview: true,
    postBeforeDelete: true,
    deduplication: true,
    automaticOff: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-wall', { recursive: true });
await writeVkConnectionInspection(
  'vk-wall',
  'vkWall',
  ['hint', 'communities', 'attachments', 'replaceOwned', 'run'],
  check,
  'vk-wall'
);
