import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitWaitFixture } from '../../experiments/issue-56/application-limit-wait-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
  successfulApplicationFixtureCommand,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `confirmed finite daily waiting and Stop share ${type} and localized controls`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationLimitWaitFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.fields[1].value = 'API owner answer.';
        fixture.state.page.dailyLimit = true;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        const input = identity(receipt, {
          action: 'start',
          waitId: 'api-limit-wait',
          confirm: true,
        });
        receipt = await api.vacancyApplicationWait(input);
        assert.equal(receipt.limitWait.phase, 'waiting');
        receipt = await api.vacancyApplicationWait(input);
        assert.equal(fixture.pendingWaits.length, 1);
        for (const locale of ['en', 'ru', 'hi', 'zh']) {
          const markup = applicationPanelMarkup(
            { receipt, options: {} },
            locale
          );
          assert(markup.includes('data-application-limit-wait="waiting"'));
          assert(markup.includes('data-application-action="stop-limit-wait"'));
          assertApplicationLocaleMarkup(markup, locale, [
            'limitWaitHint',
            'limitWait.waiting',
            'limitWaitStop',
          ]);
        }
        receipt = await api.vacancyApplicationWait(
          identity(receipt, { action: 'stop', waitId: receipt.limitWait.id })
        );
        assert.equal(receipt.limitWait.phase, 'stopped');
        assert.equal(fixture.pendingWaits.length, 0);
        assert.equal(fixture.state.closed, 0);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'foreground wait-limit and stop-limit-wait report progress without keeping the workspace writer',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitWaitFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI waiting owner answer.';
      fixture.state.page.dailyLimit = true;
      yield 'read';
      yield 'wait-limit';
      assert.equal(fixture.pendingWaits.length, 1);
      yield 'status';
      yield 'stop-limit-wait';
      assert.equal(fixture.pendingWaits.length, 0);
      assert.equal(fixture.state.closed, 0);
    };
    const output = await successfulApplicationFixtureCommand(fixture, actions);
    assert(output.some((row) => row.limitWait?.phase === 'waiting'));
    assert(output.some((row) => row.limitWait?.phase === 'stopped'));
    assert.equal(fixture.state.closed, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);
