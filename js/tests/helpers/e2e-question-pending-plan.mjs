import assert from 'node:assert/strict';
import {
  earlierAnswer,
  mountWholeTurn,
} from '../../../experiments/issue-56/whole-turn-fixture.mjs';
import { editPendingMessage } from '../../../experiments/issue-56/pending-turn-fixture.mjs';

/** Production shared controls, real native input events and protected history. */
export const verifyQuestionPendingPlan = async (
  { fixture, page, controls, run, inspect, readCurrent, shot },
  { before = false } = {}
) => {
  await mountWholeTurn(fixture);
  await inspect();
  const draft = controls.locator('[data-browser-answer-review] > pre');
  const prefill = controls.getByRole('button', {
    name: 'Prefill the reviewed draft',
    exact: true,
  });
  if (before) {
    assert.equal(await draft.textContent(), 'Yes');
    assert.equal(
      await controls.getByText(earlierAnswer, { exact: true }).count(),
      0
    );
    await controls.scrollIntoViewIfNeeded();
    await shot('whole-turn-before');
    return;
  }
  await run(
    'all pending saved answers appear in one draft and prefill without a send',
    async () => {
      assert.equal(await draft.textContent(), `1. ${earlierAnswer}\n2. Yes`);
      await controls
        .getByText(
          'The draft covers all pending messages. Review each answer before prefilling.',
          { exact: true }
        )
        .waitFor();
      await controls.scrollIntoViewIfNeeded();
      await shot('whole-turn-desktop');
      await prefill.click();
      await controls
        .getByRole('button', {
          name: 'Draft prefilled; review it in the provider chat',
          exact: true,
        })
        .waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: `1. ${earlierAnswer}\n2. Yes`,
      });
    }
  );
  await run(
    'earlier changes protect the complete draft and mobile review shows all parts',
    async () => {
      await mountWholeTurn(fixture);
      await readCurrent();
      await page.setViewportSize({ width: 390, height: 900 });
      await controls.scrollIntoViewIfNeeded();
      assert.equal(await draft.textContent(), `1. ${earlierAnswer}\n2. Yes`);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await shot('whole-turn-mobile');
      await fixture.page.evaluate(editPendingMessage, 'When can you start?');
      await prefill.click();
      await controls.getByRole('alert').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: '',
      });
      await readCurrent();
      assert.equal(await prefill.isDisabled(), true);
      assert.match(await draft.textContent(), /\{\{answer:1\}\}/);
      await page.setViewportSize({ width: 1180, height: 950 });
    }
  );
};
