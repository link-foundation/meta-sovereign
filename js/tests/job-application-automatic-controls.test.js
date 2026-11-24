import test from 'node:test';
import assert from 'node:assert/strict';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  assertApplicationReviewOnly,
  withApplicationRouteFixture,
  enterApplicationRoute,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import {
  applicationSessionClient,
  recoverApplicationSession,
} from './helpers/application-session-client.mjs';
import {
  ownedDeferralFixture,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';

test(
  'CLI policy automatically leaves a questionnaire and can re-enable questions after closure before a fresh retry',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI actual policy answer';
      fixture.state.fields[2].value = 'CLI actual policy letter';
      yield 'defer-questionnaires';
      assert.equal(fixture.state.closed, 1);
      yield 'queue';
      yield 'review-questionnaires';
      yield 'retry';
      assert.equal(fixture.state.fields[1].value, '');
      yield 'restore';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(!output.some((row) => row.ok === false));
    assert.equal(
      output.find((row) => row.mode === 'hh-application-queue').entries.length,
      1
    );
    assert.equal(output.at(-1).restoration.applied, 2);
    assert.equal(fixture.state.fields[1].value, 'CLI actual policy answer');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 2);
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `automatic policy and inactive re-enable use actual browser API and ${type} routing`,
    { timeout: 10000 },
    async (t) => {
      const fixture = ownedDeferralFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.fields[1].value = 'Actual automatic transport answer';
        receipt = await api.vacancyApplicationMode(
          identity(receipt, { noQuestionnaires: true })
        );
        assert.equal(receipt.state, 'closed');
        const [entry] = (await api.vacancyApplicationQueue({})).entries;
        assert(entry);
        receipt = await api.vacancyApplicationMode(
          identity(receipt, { noQuestionnaires: false })
        );
        assert.equal(receipt.active, false);
        assert.equal(receipt.noQuestionnaires, false);
        const reopened = await api.vacancyApplicationRetry({
          ...entry,
          queueId: entry.id,
          confirm: true,
        });
        assertApplicationReviewOnly(
          fixture,
          reopened,
          'Actual automatic transport answer'
        );
        await api.vacancyApplicationClose(identity(reopened));
      });
    }
  );
}

test(
  'closed UI receipt retains a mode control without an intent, and lost enabling replies recover without re-opening',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const value = applicationSessionClient(fixture);
    await value.session.select(applicationInput);
    await value.session.start({});
    await value.session.action('Advance', { action: 'enter', confirm: true });
    fixture.state.fields[1].value = 'Actual controller automatic answer';
    const closed = await value.session.action('Mode', {
      noQuestionnaires: true,
    });
    assert.equal(closed.state, 'closed');
    assert.equal(value.session.state.intent, null);
    const queue = await value.session.refreshQueue({});
    assert.equal(queue.entries.length, 1);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { ...value.session.state, options: {} },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'sessionHint',
        'noQuestionnaires',
      ]);
      assert.match(
        markup,
        /data-application-option="noQuestionnaires" checked=""/u
      );
      assert(
        !/data-application-option="noQuestionnaires"[^>]*disabled/u.test(markup)
      );
      assert.match(markup, /data-application-action="prefill" disabled/u);
    }
    const change = value.api.vacancyApplicationMode;
    value.api.vacancyApplicationMode = async (input) => {
      await change(input);
      throw new Error('Lost inactive mode response');
    };
    await assert.rejects(
      value.session.action('Mode', { noQuestionnaires: false })
    );
    assert.equal(value.session.state.known, false);
    const recovered = await recoverApplicationSession(fixture, value.saved);
    assert.equal(recovered.session.state.receipt.noQuestionnaires, false);
    assert.equal(recovered.session.state.receipt.active, false);
    assert.equal(fixture.state.opened, 1);
    await recovered.session.refreshQueue({});
    await recovered.session.retry(queue.entries[0]);
    assert.equal(fixture.state.fields[1].value, '');
    assert.equal(fixture.state.submitted, 0);
  }
);
