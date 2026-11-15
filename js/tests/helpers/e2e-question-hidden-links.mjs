import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { decoded } from './e2e-form-review.mjs';
import { browserChoiceDraft } from '../../src/automation/question-browser-state.js';
import {
  hiddenLink as link,
  mountHiddenQuestionLink,
} from '../../../experiments/issue-56/question-hidden-links-fixture.mjs';

const target = { source: 'hh', chat: '7' };
const mount = async (fixture, href = link.first) => {
  await fixture.send.readAnswerChoices(target);
  await fixture.page.evaluate(mountHiddenQuestionLink, href);
};
const choose = async (ui) => {
  await ui.controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await ui.controls.locator('[data-browser-answer-select]').click();
};

const verifyFrozenTargets = async (fixture) => {
  await fixture.reset();
  await mount(fixture);
  const snapshot = await fixture.send.readAnswerChoices(target);
  await fixture.page.evaluate(mountHiddenQuestionLink, link.second);
  await assert.rejects(
    fixture.send(browserChoiceDraft({ target, snapshot }, 'Yes')),
    { code: 'answer-choice-changed' }
  );
  await fixture.reset({ freeText: true });
  await mount(fixture);
  const expected = await fixture.send.readAnswerChoices(target);
  await fixture.page.evaluate(mountHiddenQuestionLink, link.second);
  await assert.rejects(
    fixture.send.prefillAnswer({ ...target, expected, text: 'Yes' })
  );
  await assert.rejects(
    fixture.send.replyText({ ...target, expected, text: 'Yes' })
  );
  assert.deepEqual(await fixture.stats(), {
    clicks: 0,
    textSends: 0,
    draft: '',
  });
};

const verifyLateTargets = async (fixture, armMutation) => {
  for (const operation of ['arm', 'armText']) {
    await fixture.reset({ freeText: operation === 'armText' });
    await mount(fixture);
    const snapshot = await fixture.send.readAnswerChoices(target);
    armMutation(operation);
    await assert.rejects(
      operation === 'arm'
        ? fixture.send(browserChoiceDraft({ target, snapshot }, 'Yes'))
        : fixture.send.replyText({
            ...target,
            expected: snapshot,
            text: 'Yes',
          }),
      {
        code:
          operation === 'arm' ? 'answer-choice-changed' : 'answer-text-changed',
      }
    );
    const stats = await fixture.stats();
    assert.equal(stats.clicks, 0);
    assert.equal(stats.textSends, 0);
    assert.deepEqual(
      (await fixture.send.readAnswerChoices(target)).question.links,
      [link.second]
    );
    assert.equal(
      await fixture.page.locator('[data-meta-answer-choice]').count(),
      0
    );
  }
};

/** One disposable native scenario: hidden href review, stale refusal and fresh receipt. */
export const verifyHiddenQuestionLinks = async (
  browser,
  { screenshots, before = false } = {}
) => {
  let mutate;
  const ui = await questionBrowserUi(browser, {
    group: 'question-hidden-links',
    screenshots,
    serverOptions: {
      afterBrowserEvaluate: async ({ page, input, result }) => {
        if (mutate && input.args?.[0]?.operation === mutate && result.armed) {
          mutate = undefined;
          await page.evaluate(mountHiddenQuestionLink, link.second);
        }
      },
    },
  });
  const { fixture, page } = ui;
  try {
    await mount(fixture);
    await ui.open();
    await ui.run(
      'hidden native destinations require review and remain literal text',
      async () => {
        const pending = page.waitForResponse((response) =>
          response.url().endsWith('/api/automations/answers/browser/inspect')
        );
        await ui.inspect();
        const review = await decoded(await pending);
        assert.equal(review.question.body, link.question);
        assert.equal(review.plan.match, 'exact');
        assert.equal(review.plan.requiresReview, !before);
        assert.deepEqual(
          review.question.links,
          before ? undefined : [link.first]
        );
        assert.deepEqual(await fixture.stats(), {
          clicks: 0,
          textSends: 0,
          draft: '',
        });
        const messages = ui.controls.locator('[data-browser-pending-turn]');
        if (!before) {
          assert.equal(await messages.locator('a').count(), 0);
          await messages.getByText(link.first, { exact: true }).waitFor();
        }
        await messages.scrollIntoViewIfNeeded();
        await ui.shot(before ? 'hidden-links-before' : 'hidden-links-after');
        await page.setViewportSize({ width: 390, height: 844 });
        await messages.scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
        await ui.shot(
          before ? 'hidden-links-before-phone' : 'hidden-links-after-phone'
        );
      }
    );
    await ui.run(
      'a changed destination invalidates the reviewed choice; a fresh review retains a positive receipt',
      async () => {
        await fixture.page.evaluate(mountHiddenQuestionLink, link.second);
        await choose(ui);
        if (!before) {
          await ui.status('failed').waitFor();
          assert.equal((await fixture.stats()).clicks, 0);
          await ui.readCurrent();
          await ui.controls.getByText(link.second, { exact: true }).waitFor();
          await choose(ui);
        }
        await ui.status('sent').waitFor();
        await ui.controls
          .getByText('Provider message receipt: 102', { exact: true })
          .waitFor();
        assert.deepEqual(await fixture.stats(), {
          clicks: 1,
          textSends: 0,
          draft: '',
        });
        await ui.open();
        await ui.controls.locator(':scope > summary').click();
        await ui.status('sent').waitFor();
        assert.equal(
          await ui.controls
            .locator('[data-browser-answer-select]')
            .isDisabled(),
          true
        );
        assert.equal((await fixture.stats()).clicks, 1);
      }
    );
    if (!before) {
      await ui.run(
        'frozen native choice, text and prefill refuse destination-only changes',
        () => verifyFrozenTargets(fixture)
      );
      await ui.run(
        'pointer guards refuse destinations changed after choice or text arming',
        () =>
          verifyLateTargets(fixture, (operation) => {
            mutate = operation;
          })
      );
    }
    return {
      ...ui.result(),
      staleChoiceSent: before,
      explicitFreshReplies: before ? 0 : 1,
      resourcesClosedOnExit: true,
    };
  } finally {
    await ui.close();
  }
};
