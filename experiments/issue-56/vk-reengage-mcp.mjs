import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready }) => {
  for (const [key, value] of [
    ['greeting', 'Hello again!'],
    ['questions', 'What do you think of this track?'],
    ['audio', 'audio-1_23'],
  ]) {
    await panel.locator(`[data-music-field=${key}]`).fill(value);
  }
  for (const action of ['save', 'plan']) {
    await panel.locator(`[data-action=vk-music-${action}]`).click();
    await ready();
  }
  const cooled = await panel.locator('[data-music-reason=cooldown]').count();
  if (!cooled) {
    if (
      (await panel.locator('[data-personal-sequence] li').count()) !== 3 ||
      !(await panel.locator('[data-personal-sequence]').innerText()).includes(
        'audio-1_23'
      )
    ) {
      throw Error('Missing ordered audio review');
    }
    await panel.locator('[data-action=vk-music-run]').click();
    await ready();
  }
  await page.reload();
  await ready();
  await panel.locator('[data-action=vk-music-plan]').click();
  await ready();
  if ((await panel.locator('[data-music-reason=cooldown]').count()) !== 1) {
    throw Error('Cooldown did not survive reload');
  }
  if (await panel.locator('[data-action=vk-music-enabled]').isChecked()) {
    throw Error('Schedule unexpectedly enabled');
  }
  return {
    focus: '[data-vk-music-plan]',
    orderedReview: true,
    cooldown: true,
    automaticOff: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-reengage', { recursive: true });
await writeVkConnectionInspection(
  'vk-music',
  'vkMusic',
  ['hint', 'greeting', 'questions', 'audio', 'run'],
  check,
  'vk-reengage'
);
