import test from 'node:test';
import assert from 'node:assert/strict';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationSessionClient } from './helpers/application-session-client.mjs';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native error holds retain the actual ${type} API receipt after banner dismissal`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationFixture();
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.page.error = 'generic-error';
        receipt = await api.vacancyApplicationRead(identity(receipt));
        assert.equal(receipt.state, 'provider-error');
        fixture.state.page.error = null;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        assert.equal(receipt.hold, 'generic-error');
        receipt = await api.vacancyApplicationMode(
          identity(receipt, { noQuestionnaires: true })
        );
        assert.equal(receipt.active, true);
        assert.equal(receipt.hold, 'generic-error');
        assert.equal((await api.vacancyApplicationQueue({})).entries.length, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'CLI emits a retained verification hold after dismissal without sending or automatically closing',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const actions = async function* () {
      yield 'enter';
      fixture.state.page.challenge = true;
      yield 'read';
      fixture.state.page.challenge = false;
      yield 'read';
      yield 'prefill';
      yield 'defer-questionnaires';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(!output.some((row) => row.ok === false));
    const held = output.filter((row) => row.hold === 'verification');
    assert(held.length >= 3);
    assert.equal(held.at(-1).active, true);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(
      fixture.state.closed,
      1,
      'only CLI shutdown closes the fixture'
    );
  }
);

test(
  'a lost hold inspection reply recovers read-only and all locales explain the manual hold',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const client = applicationSessionClient(fixture);
    await client.session.select(applicationInput);
    await client.session.start({ autoExact: true, reviewDelayMs: 0 });
    await client.session.action('Advance', { action: 'enter', confirm: true });
    fixture.state.page.error = 'validation-error';
    const inspect = client.api.vacancyApplicationRead;
    client.api.vacancyApplicationRead = async (input) => {
      await inspect(input);
      throw new Error('Finite lost inspection reply');
    };
    await assert.rejects(client.session.action('Read'));
    fixture.state.page.error = null;
    const recovered = applicationSessionClient(fixture, client.saved);
    await recovered.session.recover();
    assert.deepEqual(
      recovered.calls.map(([name]) => name),
      ['status']
    );
    assert.equal(recovered.session.state.receipt.hold, 'validation-error');
    await recovered.session.action('Read');
    await recovered.session.action('Prefill', { confirm: true });
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { ...recovered.session.state, options: {} },
        locale
      );
      assert.match(markup, /data-application-hold="validation-error"/u);
      assertApplicationLocaleMarkup(markup, locale, [
        'prefill',
        'hold.validation-error',
      ]);
      assert(!markup.includes('application.hold'));
      assert(
        markup.includes('data-application-action="prefill" disabled'),
        'each fresh receipt still requires owner confirmation'
      );
      assert(!markup.includes('Exact automatic sending is enabled'));
    }
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.fields[1].value, 'Reviewed answer');
  }
);
