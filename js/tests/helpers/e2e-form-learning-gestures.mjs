import { observeFormLearning } from '../../src/forms/monitor-learning-document.js';
import { assert } from './e2e-chat.mjs';

/** Native submit events can be trusted even when a script called requestSubmit. */
export const verifyFormLearningGestures = async (page) => {
  const probe = await page.context().newPage();
  try {
    await probe.setContent(
      '<form><input><button id="send">Send</button><button id="next">Tiếp theo →</button><button id="finish">Finish application</button></form>'
    );
    await probe.evaluate(
      `globalThis.learningEvidence = (${observeFormLearning.toString()})(); document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); globalThis.lastSubmitTrusted = event.isTrusted; });`
    );
    const intent = () =>
      probe.evaluate(
        () => globalThis.learningEvidence.read({ fields: [] }).intent
      );
    await probe.evaluate(() => document.querySelector('form').requestSubmit());
    assert(
      await probe.evaluate(() => globalThis.lastSubmitTrusted),
      'programmatic native SubmitEvent is trusted'
    );
    assert((await intent()) === 0, 'requestSubmit alone cannot teach answers');
    await probe.locator('input').press('Enter');
    assert(
      (await intent()) === 1,
      'native owner Enter establishes intent once'
    );
    await probe.locator('#next').click();
    assert((await intent()) === 1, 'Next submitter is not final submission');
    await probe.locator('#send').click();
    assert((await intent()) === 2, 'owner Send click is counted once');
    await probe.evaluate(() => document.querySelector('#send').click());
    assert(
      (await intent()) === 2,
      'synthetic click and its trusted submit are inert'
    );
    await probe.locator('#finish').click();
    assert(
      (await intent()) === 3,
      'other native submit labels retain owner gesture evidence'
    );
  } finally {
    await probe.close();
  }
};
