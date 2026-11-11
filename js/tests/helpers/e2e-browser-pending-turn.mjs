import assert from 'node:assert/strict';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  editPendingMessage,
  mountPendingHistory,
} from '../../../experiments/issue-56/pending-turn-fixture.mjs';

/** Real shared controls and native provider actions, with bounded rendered context. */
export const verifyBrowserPendingTurn = async (
  { fixture, page, controls, run, inspect, readCurrent, status, shot },
  { before = false } = {}
) => {
  await fixture.reset();
  // The first owned browser acquisition navigates once; seed after it settles.
  await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
  await fixture.page.evaluate(mountPendingHistory);
  await fixture.page
    .getByText('What is your expected salary?', { exact: true })
    .waitFor();
  await inspect();
  const turn = controls.locator(
    '[data-browser-answer-review] [data-browser-pending-turn]'
  );
  if (before) {
    await controls.scrollIntoViewIfNeeded();
    await shot('pending-turn-before');
    assert.equal(await turn.count(), 0);
    assert.equal(
      await controls
        .getByText('What is your expected salary?', { exact: true })
        .count(),
      0
    );
    return;
  }
  await run(
    'all pending messages are reviewed and an earlier edit refuses selection',
    async () => {
      assert.equal(await turn.locator('li').count(), 2);
      await turn
        .getByText(
          'The answer below addresses the latest message. Earlier messages still need review.',
          { exact: true }
        )
        .waitFor();
      await turn
        .getByText('What is your expected salary?', { exact: true })
        .waitFor();
      await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
      await controls.scrollIntoViewIfNeeded();
      await shot('pending-turn-desktop');
      await fixture.page.evaluate(editPendingMessage, 'When can you start?');
      await controls.locator('[data-browser-answer-select]').click();
      await status('failed').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: '',
      });
    }
  );
  await run(
    'a new owner reply invalidates the unchanged latest question',
    async () => {
      await fixture.reset();
      await fixture.page.evaluate(mountPendingHistory);
      await readCurrent();
      await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
      await fixture.page
        .locator('#history article')
        .nth(1)
        .evaluate((node) => {
          const status = document.createElement('span');
          status.dataset.qa = 'status-icon-delivered';
          node.append(status);
        });
      await controls.locator('[data-browser-answer-select]').click();
      await status('failed').waitFor();
      assert.equal((await fixture.stats()).clicks, 0);
    }
  );
  await run(
    'a pending edit between native arm and pointer dispatch blocks the actual click',
    async () => {
      await fixture.reset();
      await fixture.page.evaluate(mountPendingHistory);
      await readCurrent();
      await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
      await fixture.page.evaluate(() => {
        document.addEventListener(
          'pointerdown',
          () => {
            document.querySelectorAll('#history article p')[1].textContent =
              'Late pending change?';
          },
          { capture: true, once: true }
        );
      });
      await controls.locator('[data-browser-answer-select]').click();
      await status('failed').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: '',
      });
    }
  );
  await verifyPendingPrefillAndMobile({
    fixture,
    page,
    controls,
    run,
    readCurrent,
    status,
    shot,
    turn,
  });
};

const verifyPendingPrefillAndMobile = async ({
  fixture,
  page,
  controls,
  run,
  readCurrent,
  status,
  shot,
  turn,
}) => {
  await run(
    'earlier edits protect free drafts and a fresh mobile review can select once',
    async () => {
      await saveAnswerRule(fixture.store, {
        id: 'pending-salary',
        question: 'What is your expected salary?',
        answers: [{ text: 'Salary discussed separately.', approved: true }],
      });
      await fixture.reset({ freeText: true });
      await fixture.page.evaluate(mountPendingHistory);
      await readCurrent();
      await fixture.page.evaluate(
        editPendingMessage,
        'Changed pending question?'
      );
      await controls
        .getByRole('button', {
          name: 'Prefill the reviewed draft',
          exact: true,
        })
        .click();
      await controls.getByRole('alert').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 0,
        textSends: 0,
        draft: '',
      });
      await fixture.reset();
      await fixture.page.evaluate(mountPendingHistory);
      await readCurrent();
      await page.setViewportSize({ width: 390, height: 900 });
      await turn
        .getByText('What is your expected salary?', { exact: true })
        .waitFor();
      await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
      await controls.scrollIntoViewIfNeeded();
      await shot('pending-turn-mobile');
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await controls.locator('[data-browser-answer-select]').click();
      await status('sent').waitFor();
      assert.deepEqual(await fixture.stats(), {
        clicks: 1,
        textSends: 0,
        draft: '',
      });
      await page.setViewportSize({ width: 1180, height: 950 });
    }
  );
};
