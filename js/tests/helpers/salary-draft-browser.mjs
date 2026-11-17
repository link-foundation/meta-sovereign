import assert from 'node:assert/strict';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { postQuestion } from './question-http.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

/** Inspect and explicitly prefill one native composer, retaining owner drafts. */
export const verifySalaryDraft = async (browser, scenario) => {
  const fixture = await questionBrowserServer(browser);
  const call = async (action, input) =>
    postQuestion(fixture.base, `browser/${action}`, input, LINO_TEXT);
  const input = { source: 'hh', chat: '7', ...scenario.input };
  const savedRules = () =>
    fixture.store.query((row) => row.id.startsWith('qa-rule:'));
  const capture = async () => {
    if (scenario.screenshot) {
      await fixture.page.screenshot({ path: scenario.screenshot });
    }
  };
  try {
    for (const rule of scenario.rules ?? []) {
      await saveAnswerRule(fixture.store, rule);
    }
    const before = await savedRules();
    await fixture.reset({ freeText: true, question: scenario.question });
    const inspected = await call('inspect', input);
    await capture();
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.plan.text, scenario.expected);
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: '',
    });
    const applied = await call('prefill', { id: inspected.body.id });
    assert.equal(applied.status, 200);
    const result = await fixture.stats();
    assert.deepEqual(result, {
      clicks: 0,
      textSends: 0,
      draft: scenario.expected,
    });
    await capture();
    await fixture.reset({
      freeText: true,
      question: scenario.question,
      draft: 'Keep my own answer',
    });
    const owned = await call('inspect', input);
    const held = await call('prefill', { id: owned.body.id });
    assert.notEqual(held.status, 200);
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: 'Keep my own answer',
    });
    assert.deepEqual(await savedRules(), before);
    const salary =
      inspected.body.plan.salary ??
      inspected.body.plan.salaryTemplates.fields[0];
    return {
      draft: result.draft,
      currency: salary.currency,
      basis: salary.basis,
      textSends: 0,
      ownerDraftPreserved: true,
      rulesPreserved: true,
    };
  } finally {
    await fixture.close();
  }
};
