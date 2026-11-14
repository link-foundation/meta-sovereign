import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationResult } from '../src/jobs/application-result.js';
import {
  applicationBatchFixture,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `batch freezes the survey opt-out in ${type} receipts`,
    { timeout: 5000 },
    async (t) => {
      const fixture = applicationBatchFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const receipt = await api.vacancyApplicationBatchStart({
          ...batchInput,
          confirmations: ['send'],
          autoAnswerViewedVacancy: false,
        });
        assert.equal(receipt.batch.settings.autoAnswerViewedVacancy, false);
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.settings.autoAnswerViewedVacancy, false);
        assert.equal(fixture.state.submitted, 0);
      });
    }
  );
  test(
    `frozen native survey opt-out crosses ${type}, with read-only recovery`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationFixture();
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const input = { ...applicationInput, autoAnswerViewedVacancy: false };
        const receipt = await api.vacancyApplicationOpen(input);
        assert.equal(receipt.autoAnswerViewedVacancy, false);
        assert.throws(() =>
          applicationResult(
            { ...receipt, autoAnswerViewedVacancy: 'false' },
            input
          )
        );
        await api.vacancyApplicationClose({
          ...input,
          revision: receipt.revision,
        });
        const status = await api.vacancyApplicationStatus(input);
        assert.equal(status.autoAnswerViewedVacancy, false);
        assert.equal(fixture.state.opened, 1);
        assert.equal(fixture.state.entered + fixture.state.submitted, 0);
      });
    }
  );
}

test(
  'foreground CLI exposes the opt-out and drains the owned review',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const input = async function* () {
      yield 'quit';
    };
    const result = await runApplicationFixtureCommand(fixture, input, {
      'no-auto-answer-viewed-vacancy': true,
    });
    assert.equal(result.status, 0);
    assert.equal(result.output[0].autoAnswerViewedVacancy, false);
    assert.equal(fixture.state.closed, 1);
  }
);

test('four locales expose the default survey setting and preview/owner-choice explanation', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = applicationPanelMarkup(
      { options: {}, setOptions: () => {}, intent: null },
      locale
    );
    assert(
      markup.includes('data-application-option="autoAnswerViewedVacancy"')
    );
    for (const suffix of [
      'autoAnswerViewedVacancy',
      'feedbackHint',
      'feedbackAutomatic',
      'feedbackManual',
      'feedbackPreview',
    ]) {
      assertApplicationTranslation(locale, suffix);
    }
  }
});
