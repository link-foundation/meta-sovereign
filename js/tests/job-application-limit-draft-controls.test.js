import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitDraftFixture } from '../../experiments/issue-56/application-limit-draft-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  successfulApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `actual daily-limit drafts survive ${type} API and four-language UI recovery`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationLimitDraftFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.fields[1].value = 'Actual answer during daily pause.';
        fixture.state.fields[2].value = 'Actual letter during daily pause.';
        fixture.state.page.dailyLimit = true;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        assert.equal(receipt.draft.limit.until, receipt.applicationLimit.until);
        const status = await api.vacancyApplicationStatus(identity(receipt));
        assert.equal(status.draft.id, receipt.draft.id);
        for (const locale of ['en', 'ru', 'hi', 'zh']) {
          const markup = applicationPanelMarkup(
            { receipt: status, options: {} },
            locale
          );
          assert(markup.includes('data-application-limit-draft'));
          assert(markup.includes('Actual answer during daily pause.'));
          assert(markup.includes('Actual letter during daily pause.'));
          assertApplicationTranslation(locale, 'limitDraftSaved');
        }
        assert.equal(fixture.state.closed, 0);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'foreground CLI reports the automatically backed actual values and closes only on owner exit',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI owner answer.';
      fixture.state.fields[2].value = 'CLI owner letter.';
      fixture.state.page.dailyLimit = true;
      yield 'read';
      assert.equal(fixture.state.closed, 0);
      fixture.state.page.dailyLimit = false;
      yield 'read';
    };
    const output = await successfulApplicationFixtureCommand(fixture, actions);
    const backed = output.filter((row) => row.draft?.limit);
    assert(backed.length >= 2);
    assert.equal(new Set(backed.map((row) => row.draft.id)).size, 1);
    assert.deepEqual(
      backed[0].draft.fields.map((field) => field.value),
      ['CLI owner answer.', 'CLI owner letter.']
    );
    assert.equal(fixture.state.closed, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);
