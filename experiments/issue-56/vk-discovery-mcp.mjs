import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
const check = async (page, { panel, ready, action }) => {
  await action('plan');
  if (
    !(await panel.locator('[data-vk-suggestions-status=confirmed]').count())
  ) {
    if (
      (await panel
        .locator('[data-suggestions-id="11"][data-suggestions-reason=eligible]')
        .count()) !== 1
    ) {
      throw Error('Best mutually ranked suggestion is missing');
    }
    await action('run');
  }
  for (const kind of ['community', 'rejections']) {
    const section = page.locator(`[data-vk-${kind}]`);
    if (await section.locator(`[data-action=vk-${kind}-enabled]`).isChecked()) {
      throw Error('Independent discovery scheduling unexpectedly enabled');
    }
    await section.locator(`[data-action=vk-${kind}-plan]`).click();
    await section
      .locator(`[data-action=vk-${kind}-enabled]`)
      .waitFor({ state: 'attached' });
    await section.locator('[data-discovery-summary]').waitFor();
  }
  await page.reload();
  await ready();
  await action('plan');
  if (
    (await panel.locator('[data-vk-suggestions-status=confirmed]').count()) !==
      1 ||
    (await panel
      .locator('[data-suggestions-id="11"][data-suggestions-reason=eligible]')
      .count())
  ) {
    throw Error('Confirmed suggestion was not retained after reload');
  }
  return {
    focus: '[data-vk-suggestions-plan]',
    rankedSuggestion: 11,
    noReplay: true,
    independentPolicies: 3,
  };
};
await mkdir('docs/screenshots/issue-56-vk-discovery', { recursive: true });
await writeVkConnectionInspection(
  'vk-suggestions',
  'vkSuggestions',
  ['hint', 'scanLimit', 'maxFriends', 'run'],
  check,
  'vk-discovery'
);
