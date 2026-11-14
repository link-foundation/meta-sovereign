import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitRejectionFixture } from '../../experiments/issue-56/application-limit-rejection-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationResult } from '../src/jobs/application-result.js';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  assertApplicationPanelLocales,
  successfulApplicationFixtureCommand,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `issued native rejection and consented restoration cross ${type}`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationLimitRejectionFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.fields[1].value =
          'API owner answer after issued rejection.';
        receipt = await api.vacancyApplicationRead(identity(receipt));
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'submit', confirm: true })
        );
        assert.equal(receipt.dailyRejection, 'recorded');
        assertApplicationPanelLocales(
          receipt,
          ['dailyRejection.recorded'],
          (markup) =>
            assert(
              markup.includes('data-application-daily-rejection="recorded"')
            )
        );
        receipt = await api.vacancyApplicationWait(
          identity(receipt, {
            action: 'start',
            waitId: 'confirmed-native-rejection',
            restoreDraft: true,
            confirm: true,
          })
        );
        receipt = await fixture.pulse(Date.parse(receipt.limitWait.until), () =>
          api.vacancyApplicationStatus(identity(receipt))
        );
        assert.equal(receipt.limitWait.phase, 'review');
        assert.equal(receipt.dailyRejection, 'released');
        assert.equal(receipt.restoration.state, 'restored');
        assert.equal(fixture.state.submitted, 1);
        assert.equal(
          fixture.state.fields[1].value,
          'API owner answer after issued rejection.'
        );
        assertApplicationPanelLocales(receipt, ['dailyRejection.released']);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'foreground wait-and-restore handles an acknowledged rejection without sending again',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI actual owner answer.';
      yield 'read';
      yield 'submit';
      yield 'wait-limit-restore';
      assert.equal(fixture.pendingWaits.length, 1);
      fixture.clock.value += 7200000;
      fixture.pendingWaits[0].finish();
      yield 'status';
      yield 'stop-limit-wait';
    };
    const output = await successfulApplicationFixtureCommand(fixture, actions);
    assert(output.some((row) => row.dailyRejection === 'recorded'));
    assert(output.some((row) => row.limitWait?.restoreDraft === true));
    assert.equal(fixture.state.submitted, 1);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'public rejection states validate without exposing private evidence or changing legacy receipts',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitRejectionFixture(t);
    const receipt = await fixture.rejected();
    assert.equal(
      applicationResult(receipt, receipt).dailyRejection,
      'recorded'
    );
    for (const value of ['sent', {}, true]) {
      assert.throws(() =>
        applicationResult({ ...receipt, dailyRejection: value }, receipt)
      );
    }
    const legacy = { ...receipt };
    delete legacy.dailyRejection;
    applicationResult(legacy, receipt);
    assert(!JSON.stringify(receipt).includes('reservationRevision'));
    assert(
      !JSON.stringify(receipt).includes('secret:jobs-application-rejection:')
    );
  }
);
