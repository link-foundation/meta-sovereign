import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';

const check = async (page, { panel, ready, action }) => {
  const any = panel.locator('[data-wall-field=holdAnyVisible]');
  await panel.locator('[data-wall-field=communities]').fill('42');
  await panel.locator('[data-wall-field=replaceOwned]').check();
  await any.check();
  await action('save');
  await action('plan');
  if (
    (await panel.locator('[data-wall-reason=visibleInvitation]').count()) !== 1
  ) {
    throw Error('Missing any-author invitation hold');
  }
  const done = await panel.locator('[data-wall-absent]').count();
  if (!done) {
    await any.uncheck();
    await action('save');
    await action('plan');
    await action('run');
    await panel.locator('[data-vk-wall-status=confirmed]').waitFor();
  }
  const absent = panel.locator('[data-wall-absent]');
  const evidence = await absent.innerText();
  if (!evidence.trim() || evidence.includes('vkWall.')) {
    throw Error('Missing translated confirmed-absence evidence');
  }
  await any.check();
  await action('save');
  await page.reload();
  await ready();
  if (!(await any.isChecked())) {
    throw Error('Any-author hold was not retained');
  }
  await action('plan');
  if (
    (await panel.locator('[data-wall-reason=visibleInvitation]').count()) !== 1
  ) {
    throw Error('Missing held destination after reload');
  }
  return {
    focus: '[data-wall-absent]',
    anyAuthorHold: true,
    retainedAfterReload: true,
    confirmedAbsence: true,
  };
};
await mkdir('docs/screenshots/issue-56-vk-wall-parity', { recursive: true });
await writeVkConnectionInspection(
  'vk-wall',
  'vkWall',
  ['holdAnyVisible'],
  check,
  'vk-wall-parity'
);
