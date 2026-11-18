import { mkdir } from 'node:fs/promises';
import { writeVkConnectionInspection } from './vk-connection-mcp.mjs';
import { dictionaries } from '../../js/src/web/locales/index.js';

const check = async (page, { panel, ready, fixture }) => {
  const choice = panel.locator('[data-friend-field=acceptancePolicy]');
  await choice.selectOption('desktop-configured');
  await ready();
  const percentage = panel.locator('[data-friend-field=topPercentMutuals]');
  await percentage.fill('12.5');
  await panel.locator('[data-action=vk-friends-save]').click();
  await ready();
  await page.reload();
  await ready();
  if (
    (await percentage.inputValue()) !== '12.5' ||
    (await choice.inputValue()) !== 'desktop-configured' ||
    !(await panel.innerText()).includes(
      fixture.hints[await page.locator('html').getAttribute('lang')].replace(
        '{percent}',
        '12.5'
      )
    )
  ) {
    throw new Error('Configured choice, percentage or translated hint lost');
  }
  await page.request.post(`${fixture.control}/refuse`);
  await percentage.fill('35');
  await panel.locator('[data-action=vk-friends-save]').click();
  await panel.getByRole('alert').waitFor();
  const refused = await (await page.request.get(fixture.control)).json();
  if (
    (await percentage.inputValue()) !== '35' ||
    refused.settings.topPercentMutuals !== 12.5
  ) {
    throw new Error(
      'Refused percentage overwrote saved policy or lost owner draft'
    );
  }
  await page.request.post(`${fixture.control}/allow`);
  await page.reload();
  await ready();
  const result = await (await page.request.get(fixture.control)).json();
  if (
    (await percentage.inputValue()) !== '12.5' ||
    result.syntheticFriendCalls ||
    result.messages
  ) {
    throw new Error(
      'Read-only recovery changed configuration or issued effects'
    );
  }
  return {
    focus: '[data-friend-field=topPercentMutuals]',
    savedChoiceRetained: true,
    fractionalPercentage: true,
    refusedDraftRetained: true,
    syntheticFriendCalls: 0,
    messages: 0,
  };
};

await mkdir('docs/screenshots/issue-56-vk-configured', { recursive: true });
await writeVkConnectionInspection(
  'vk-friends',
  'vkFriends',
  ['acceptancePolicy', 'desktop-configured'],
  check,
  'vk-configured',
  {
    control: process.argv[3],
    hints: Object.fromEntries(
      Object.entries(dictionaries).map(([language, words]) => [
        language,
        words['vkFriends.configuredHint'],
      ])
    ),
  }
);
