import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  for (const [key, value] of [
    ['timeZone', 'UTC'],
    ['messages', 'Happy birthday!'],
    ['stickers', '60302'],
    ['attachments', 'video1_23'],
  ]) {
    await panel.locator(`[data-birthday-field=${key}]`).fill(value);
  }
  const action = async (name) => {
    await panel.locator(`[data-action=vk-birthday-${name}]`).click();
    await ready();
  };
  await action('save');
  await action('plan');
  if (!(await panel.locator('[data-birthday-reason=cooldown]').count())) {
    if (
      (await panel.locator('[data-personal-sequence] li').count()) !== 2 ||
      !(await panel.locator('[data-personal-sequence]').innerText()).includes(
        'video1_23'
      ) ||
      !(await panel.locator('[data-birthday-date]').innerText()).includes(
        '2026-11-15'
      )
    ) {
      throw Error('Missing reviewed birthday date and native message payload');
    }
    await action('run');
  }
  await page.reload();
  await ready();
  await action('plan');
  if ((await panel.locator('[data-birthday-reason=cooldown]').count()) !== 1) {
    throw Error('Birthday date deduplication was not retained');
  }
  if (
    (await panel
      .locator('[data-sequence-receipt]:not([data-sequence-receipt=""])')
      .count()) !== 2
  ) {
    throw Error('Completed birthday receipts are missing from date review');
  }
  if (await panel.locator('[data-action=vk-birthday-enabled]').isChecked()) {
    throw Error('Birthday scheduling unexpectedly enabled');
  }
  return {
    focus: '[data-vk-birthday-plan]',
    reviewedBirthday: true,
    dateDeduplication: true,
    automaticOff: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-birthday', { recursive: true });
await writeVkConnectionInspection(
  'vk-birthday',
  'vkBirthday',
  ['hint', 'timeZone', 'messages', 'stickers', 'attachments', 'run'],
  check,
  'vk-birthday'
);
