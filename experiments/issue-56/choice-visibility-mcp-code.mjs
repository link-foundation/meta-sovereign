import {
  prepareChoiceVisibility,
  choiceVisibilityReceipt,
  choiceVisibilityState,
} from './choice-visibility-fixture.mjs';

// Print static repository functions for MCP's isolated JavaScript VM.
console.log(`async (page) => {
  const prepare = (${prepareChoiceVisibility.toString()});
  const receipt = (${choiceVisibilityReceipt.toString()});
  const state = (${choiceVisibilityState.toString()});
  const base = new URL(page.url()).origin;
  const directory = '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-choice-visibility';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  for (const layout of ['ordinary', 'reversed']) {
    await page.goto(base + '/chat/7');
    await prepare(page, layout);
    const before = await state(page);
    if (before.visible) throw new Error('Fixture reply is already visible');
    await page.screenshot({path: directory + '/mcp-before-' + layout + '.png'});
    const confirmed = await receipt(page);
    const after = await state(page);
    if (!confirmed.sent || confirmed.messageId !== '102' || !after.visible || after.clicks !== 1 || after.textSends !== 0) {
      throw new Error('Confirmed reply was not revealed: ' + JSON.stringify({confirmed,after}));
    }
    await page.screenshot({path: directory + '/mcp-after-' + layout + '.png'});
    results.push({layout, before, confirmed, after});
  }
  await page.goto(base + '/chat/7');
  await prepare(page, 'ordinary');
  await page.locator('textarea').fill('Owner reply remains mine');
  const ownerBefore = await state(page);
  const ownerReceipt = await receipt(page);
  const ownerAfter = await state(page);
  if (!ownerReceipt.sent || JSON.stringify(ownerBefore) !== JSON.stringify(ownerAfter)) {
    throw new Error('Owner reply or view was changed');
  }
  await page.screenshot({path: directory + '/mcp-owner-draft.png'});
  if (errors.length) throw new Error(JSON.stringify(errors));
  return {results, owner: {receipt: ownerReceipt, state: ownerAfter}, pageErrors: errors};
}`);
