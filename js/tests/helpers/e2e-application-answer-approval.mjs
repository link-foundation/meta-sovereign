import assert from 'node:assert/strict';
import { join } from 'node:path';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  nativeApplicationReviewRequest,
  nativeApplicationForm,
} from './application-native-request.mjs';

const question = 'Which editor do you use?';
const cases = {
  whole: [
    {
      question: `1. ${question}\n2. Where do you live?`,
      text: '1. Vim.\n2. Helsinki.',
      approved: true,
    },
  ],
  unapproved: [{ question, text: 'Vim.', approved: false }],
  conflicting: [
    { question, text: 'Vim.', approved: true },
    { question, text: 'Emacs.', approved: true },
  ],
};

/** Actual form planning and native dispatch, with every provider request routed locally. */
export const verifyNativeApplicationAnswerApproval = async (browser) => {
  const receipts = [];
  for (const [name, rules] of Object.entries(cases)) {
    if (
      process.env.APPLICATION_APPROVAL_CASE &&
      process.env.APPLICATION_APPROVAL_CASE !== name
    ) {
      continue;
    }
    const fixture = await applicationNativeFixture(browser, {
      questionLabel: question,
    });
    const request = (operation, receipt, extra) =>
      nativeApplicationReviewRequest(fixture, operation, receipt, extra);
    try {
      for (const [index, rule] of rules.entries()) {
        await saveAnswerRule(fixture.store, {
          id: `approval-${name}-${index}`,
          question: rule.question,
          answers: [{ text: rule.text, approved: rule.approved, count: 0 }],
        });
      }
      let receipt = await request('open', null, {
        autoExact: true,
        reviewDelayMs: 0,
      });
      receipt = await request('advance', receipt, {
        action: 'enter',
        confirm: true,
      });
      const owned = nativeApplicationForm(browser);
      receipt = await request('prefill', receipt, { confirm: true });
      if (process.env.APPLICATION_APPROVAL_SCREENSHOTS) {
        await owned.screenshot({
          path: join(
            process.env.APPLICATION_APPROVAL_SCREENSHOTS,
            `application-approval-${name}.png`
          ),
        });
      }
      assert.equal(
        await owned.evaluate(() => globalThis.applicationAttempts),
        0
      );
      assert.equal(await owned.locator('#experience').inputValue(), '');
      assert.equal(receipt.exact, false);
      assert.equal(
        receipt.report.fields.find((field) => field.label === question).answer
          .reuseRequiresReview,
        true
      );
      await owned.locator('#experience').fill('Owner reviewed answer.');
      receipt = await request('read', receipt);
      assert.equal(receipt.exact, false);
      // The existing explicit native submit remains available after owner review.
      receipt = await request('advance', receipt, {
        action: 'submit',
        confirm: true,
      });
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(
        await owned.evaluate(() => globalThis.applicationAttempts),
        1
      );
      await request('close', receipt);
      assert(owned.isClosed());
      assert.deepEqual(fixture.errors, []);
      receipts.push({
        name,
        automaticSubmissions: 0,
        automaticWrites: 0,
        reviewedSubmissions: 1,
        ownedBrowserClosed: true,
      });
    } finally {
      await fixture.close();
    }
  }
  return receipts;
};
