import assert from 'node:assert/strict';
import {
  messageDefaultsServer,
  messageDefaultPolicies,
} from '../../../experiments/issue-56/vk-message-defaults-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

const verifyPolicy = async (page, fixture, name, options) => {
  const { panel, ready, action } = vkReviewedControls(page, name);
  await ready();
  const messages = panel.locator(`[data-${name}-field=messages]`);
  const reset = panel.locator(`[data-action=vk-${name}-message-defaults]`);
  if (options.before) {
    assert.equal(await reset.count(), 0);
    await captureVkAutomationLayouts(
      page,
      messages,
      options.screenshots,
      `before-${name}`
    );
    return { name, missingReset: true };
  }
  const policy = messageDefaultPolicies[name];
  const saved = await policy.settings(fixture.store);
  assert.equal(await messages.inputValue(), saved.messages);
  const personal = `Unsaved ${name} text`;
  await messages.fill(personal);
  await panel.locator(`[data-${name}-field=limit]`).fill('42');
  await reset.click();
  assert.equal((await messages.inputValue()).split('\n').length, 10);
  assert.equal(
    await panel.locator(`[data-${name}-field=limit]`).inputValue(),
    '42'
  );
  assert.deepEqual(await policy.settings(fixture.store), saved);
  await captureVkAutomationLayouts(
    page,
    reset,
    options.screenshots,
    `reset-${name}`
  );
  await panel.locator(`[data-action=vk-${name}-message-undo]`).click();
  assert.equal(await messages.inputValue(), personal);
  if (name === 'wall') {
    assert.equal(
      await panel.locator('[data-wall-field=marker]').inputValue(),
      saved.marker
    );
    assert.equal(
      await panel.locator('[data-wall-field=restrictedMessage]').inputValue(),
      saved.restrictedMessage
    );
  }
  await reset.click();
  fixture.refuseWrites(true);
  await action('save');
  await panel.getByRole('alert').waitFor();
  assert.equal((await messages.inputValue()).split('\n').length, 10);
  assert.deepEqual(await policy.settings(fixture.store), saved);
  await captureVkAutomationLayouts(
    page,
    reset,
    options.screenshots,
    `refused-${name}`
  );
  fixture.refuseWrites(false);
  await action('save');
  const acknowledged = await policy.settings(fixture.store);
  assert.equal(acknowledged.messages.split('\n').length, 10);
  assert.equal(acknowledged.limit, 42);
  assert.equal(acknowledged.enabled, false);
  await page.reload();
  await ready();
  assert.equal(await messages.inputValue(), acknowledged.messages);
  await captureVkAutomationLayouts(
    page,
    reset,
    options.screenshots,
    `saved-${name}`
  );
  return {
    name,
    draftOnly: true,
    undoOwnerText: true,
    otherFieldsPreserved: true,
    refusedSaveRetained: true,
    savedReloadRetained: true,
  };
};

export const verifyVkMessageDefaults = async (browser, options = {}) => {
  const fixture = await messageDefaultsServer();
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const result = [];
    for (const name of Object.keys(messageDefaultPolicies)) {
      result.push(await verifyPolicy(page, fixture, name, options));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.effects, []);
    assert.equal(fixture.messages(), 0);
    return { result, pageErrors: 0, providerWrites: 0, liveProvider: false };
  });
};
