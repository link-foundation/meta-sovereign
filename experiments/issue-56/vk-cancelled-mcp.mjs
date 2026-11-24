import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  for (const [key, value] of [
    ['greeting', 'Hello, friend.'],
    ['question', 'Would you like to stay in touch?'],
    ['limit', '1'],
  ]) {
    await panel.locator(`[data-cancelled-field=${key}]`).fill(value);
  }
  for (const action of ['save', 'plan']) {
    await panel.locator(`[data-action=vk-cancelled-${action}]`).click();
    await ready();
  }
  const previouslyPrompted = await panel
    .locator('[data-cancelled-reason=alreadyPrompted]')
    .count();
  if (
    !previouslyPrompted &&
    (await panel.locator('[data-cancelled-message]').innerText()) !==
      'Hello, friend.\nWould you like to stay in touch?'
  ) {
    throw new Error('Reviewed message mismatch');
  }
  await panel.locator('[data-action=vk-cancelled-run]').click();
  await ready();
  await page.reload();
  await ready();
  await panel.locator('[data-action=vk-cancelled-plan]').click();
  await ready();
  if (
    (await panel.locator('[data-cancelled-reason=alreadyPrompted]').count()) !==
    1
  ) {
    throw new Error('Duplicate prompt not suppressed');
  }
  if (
    (await panel
      .locator('[data-cancelled-field=blockUnanswered]')
      .isChecked()) ||
    (await panel.locator('[data-cancelled-field=blockUnwritable]').isChecked())
  ) {
    throw new Error('Implicit blocking consent');
  }
  return {
    focus: '[data-vk-cancelled-plan]',
    honestEvidence: true,
    reviewed: true,
    noRepeat: true,
    blockingOff: true,
    savedText: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-cancelled', { recursive: true });
await writeVkConnectionInspection(
  'vk-cancelled',
  'vkCancelled',
  ['hint', 'blockUnanswered', 'blockUnwritable', 'plan', 'run'],
  check
);
