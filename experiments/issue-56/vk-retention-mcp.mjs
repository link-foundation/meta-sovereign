import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready, action }) => {
  await panel.locator('[data-retention-field=peers]').fill('9');
  await panel.locator('[data-retention-field=threshold]').fill('1');
  await action('save');
  await action('plan');
  if (
    !(await panel.locator('[data-retention-reason=belowThreshold]').count())
  ) {
    if (
      !(await panel.locator('[data-retention-evidence]').innerText()).includes(
        '3'
      )
    ) {
      throw Error('Missing reviewed retention message counts');
    }
    await action('run');
  }
  await page.reload();
  await ready();
  await action('plan');
  if (
    (await panel.locator('[data-retention-reason=belowThreshold]').count()) !==
      1 ||
    (await panel.locator('[data-vk-retention-status=confirmed]').count()) !==
      1 ||
    !(await panel.locator('[data-retention-evidence]').innerText()).includes(
      '3'
    )
  ) {
    throw Error('Confirmed retention and provider receipt were not recovered');
  }
  if (await panel.locator('[data-action=vk-retention-enabled]').isChecked()) {
    throw Error('Retention scheduling unexpectedly enabled');
  }
  return {
    focus: '[data-vk-retention-plan]',
    reviewedRetention: true,
    confirmedRecovery: true,
    automaticOff: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-retention', { recursive: true });
await writeVkConnectionInspection(
  'vk-retention',
  'vkRetention',
  ['hint', 'peers', 'threshold', 'scanLimit', 'run'],
  check,
  'vk-retention'
);
