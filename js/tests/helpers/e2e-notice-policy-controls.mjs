import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import { readAnswerPolicy } from '../../src/automation/question-policy.js';

const verifyChatNoticeControls = async (page, fixture, shot) => {
  for (const [surface, hash] of [
    ['chat', '#chat=hh:7'],
    ['operator', '#/operator?chat=hh%3A7'],
  ]) {
    // Opening Chat marks the synthetic conversation read; restore a fresh
    // unread fixture before checking Operator's independently scoped queue.
    await fixture.reset({ id: '101', freeText: true });
    await page.goto(`${fixture.base}/?notice-controls=${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const controls = page.locator(
      '.chat-menu-list [data-browser-answer-controls]'
    );
    await openQuestionDisclosure(controls);
    await controls.locator('[data-notice-watch-mode]').waitFor();
    assert.equal(
      await controls.locator('[data-notice-watch-mode]').isChecked(),
      false
    );
    if (surface === 'operator') {
      await page.setViewportSize({ width: 390, height: 844 });
      await controls
        .locator('[data-notice-watch-mode]')
        .scrollIntoViewIfNeeded();
      await shot('operator-mobile-after');
      const checkbox = controls.locator('[data-notice-watch-mode]');
      assert.ok((await checkbox.boundingBox()).width <= 24);
      assert.ok((await checkbox.locator('..').boundingBox()).height < 100);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
    }
  }
};

const saveNoticePolicyControls = async (policy, fixture, shot) => {
  const fields = policy.locator('[data-notice-policies]');
  await fields.waitFor();
  assert.deepEqual(
    await fields
      .locator('select')
      .evaluateAll((nodes) => nodes.map((node) => node.value)),
    ['review', 'review', 'review']
  );
  await fields
    .getByLabel('Application acknowledgements', { exact: true })
    .selectOption('reply');
  await fields.getByLabel('Rejections', { exact: true }).selectOption('reply');
  assert.deepEqual(
    await fields
      .getByLabel('Invitations', { exact: true })
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => node.value)),
    ['review', 'ignore']
  );
  await fields
    .getByLabel('Reply asking for the rejection reason', { exact: true })
    .fill('May I ask why?');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  assert.equal(
    (await readAnswerPolicy(fixture.store)).notices.rejections,
    'reply'
  );
  assert.equal((await fixture.stats()).textSends, 0);
  await fields.scrollIntoViewIfNeeded();
  await shot('settings-after');
};

/** Common localized controls use saved policy and explicit reviewed ownership. */
export const verifyNoticePolicyControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const ui = await questionBrowserUi(browser, {
    screenshots,
    group: 'notice-policy-controls',
    serverOptions: { noticePolicies: true },
  });
  const { page, fixture, shot } = ui;
  page.setDefaultTimeout(15000);
  try {
    await ui.open();
    const policy = page.locator('[data-answer-policy]');
    await openQuestionDisclosure(policy);
    await policy.getByRole('button', { name: 'Save', exact: true }).waitFor();
    if (before) {
      assert.equal(await policy.locator('[data-notice-policies]').count(), 0);
      await policy.scrollIntoViewIfNeeded();
      await shot('settings-before');
      await ui.inspect();
      assert.equal(
        await ui.controls.locator('[data-notice-watch-mode]').count(),
        0
      );
      await ui.controls
        .locator('[data-browser-answer-watch]')
        .scrollIntoViewIfNeeded();
      await shot('watch-before');
      return {
        before: true,
        missingNoticePolicies: true,
        providerSends: (await fixture.stats()).textSends,
      };
    }
    await saveNoticePolicyControls(policy, fixture, shot);
    await ui.inspect();
    const watch = ui.controls.locator('[data-browser-answer-watch]');
    const mode = watch.locator('[data-notice-watch-mode]');
    assert.ok(
      (await mode.boundingBox()).width <= 24,
      'Checkbox keeps its native control width'
    );
    assert.ok(
      (await mode.locator('..').boundingBox()).height < 100,
      'Checkbox label remains readable'
    );
    assert.equal(await mode.isChecked(), false);
    await mode.check();
    await watch.scrollIntoViewIfNeeded();
    await shot('watch-after');
    // Headless browser contexts retain independent native activation. Give the
    // provider context an actual owner tab, without replacing its focus API.
    const owner = await fixture.page.context().newPage();
    await owner.setContent('<textarea>Owner unfinished draft</textarea>');
    await owner.bringToFront();
    await page.bringToFront();
    await watch.locator('[data-browser-watch-start]').click();
    const supported = browser.browserType().name() === 'chromium';
    if (supported) {
      await watch
        .getByText('Provider message receipt: 102', { exact: true })
        .waitFor();
      await watch
        .getByText(
          'Complete application history was verified for this notice decision.',
          { exact: true }
        )
        .waitFor();
      await watch
        .getByText(
          'The saved notice policy authorized this exact approved answer.',
          { exact: true }
        )
        .waitFor();
      assert.equal(
        await watch
          .getByText('Review required before automatic sending.', {
            exact: true,
          })
          .count(),
        0
      );
      await watch
        .getByText('Provider message receipt: 102', { exact: true })
        .scrollIntoViewIfNeeded();
      await shot('receipt-after');
    } else {
      await watch.locator('[data-browser-watch-state="paused"]').waitFor();
      await watch
        .getByText('Watcher detail: browser-background-focus-unavailable', {
          exact: true,
        })
        .waitFor();
    }
    const providerSends = (await fixture.stats()).textSends;
    assert.equal(providerSends, supported ? 1 : 0);
    assert.equal(
      await owner.locator('textarea').inputValue(),
      'Owner unfinished draft'
    );
    assert.equal((await fixture.stats()).clicks, 0);
    await watch.locator('[data-browser-watch-stop]').click();
    await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
    await verifyChatNoticeControls(page, fixture, shot);
    return {
      ...ui.result(),
      cases: 4,
      providerSends,
    };
  } catch (error) {
    console.error(error);
    await shot('failure');
    console.error(
      JSON.stringify({
        controls: (await ui.controls.count())
          ? await ui.controls.textContent()
          : 'Surface changed',
        provider: await fixture.stats(),
      })
    );
    throw error;
  } finally {
    await ui.close();
  }
};
