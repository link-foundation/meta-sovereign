import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationRecoveryFixture } from '../../experiments/issue-56/application-recovery-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { wirePost } from './helpers/vacancy-routes.mjs';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `popup recovery has separate confirmed entry through ${type}`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationRecoveryFixture({ popup: true });
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        let receipt = await api.vacancyApplicationOpen(applicationInput);
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'enter', confirm: true })
        );
        await api.vacancyApplicationClose(identity(receipt));
        receipt = await api.vacancyApplicationOpen({
          ...applicationInput,
          recover: true,
        });
        assert.equal(receipt.reentryAvailable, true);
        for (const locale of ['en', 'ru', 'hi', 'zh']) {
          const markup = applicationPanelMarkup(
            { receipt, intent: applicationInput, target: applicationInput },
            locale
          );
          assertApplicationLocaleMarkup(markup, locale, [
            'reenter',
            'reenterHint',
          ]);
          assert.match(markup, /data-application-action="reenter" disabled/);
        }
        const refused = await wirePost(
          base,
          'application-advance',
          identity(receipt, { action: 'reenter', confirm: false }),
          type
        );
        assert.equal(refused.status, 400);
        const stale = receipt;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        const outdated = await wirePost(
          base,
          'application-advance',
          identity(stale, { action: 'reenter', confirm: true }),
          type
        );
        assert.equal(outdated.status, 409);
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'reenter', confirm: true })
        );
        assert.equal(receipt.state, 'review');
        assert.equal(fixture.state.entered, 2);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'CLI recovered popup stays read only until the explicit reenter command',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRecoveryFixture({ popup: true });
    t.after(() => fixture.close());
    await fixture.enter();
    await fixture.service.stop();
    const stream = async function* () {
      assert.equal(fixture.state.entered, 1);
      yield 'status';
      yield 'enter';
      assert.equal(fixture.state.entered, 1);
      yield 'reenter';
      assert.equal(fixture.state.entered, 2);
      yield 'quit';
    };
    const result = await runApplicationFixtureCommand(fixture, stream, {
      recover: 'true',
    });
    assert.equal(result.status, 0);
    assert(
      result.output.some(
        (row) => row.code === 'jobs-application-already-attempted'
      )
    );
    assert.equal(result.output.at(-1).state, 'review');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, fixture.state.opened);
  }
);
