import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { supervisedOptions } from '../../experiments/issue-56/application-supervised-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { wirePost } from './helpers/vacancy-routes.mjs';
import {
  applicationSessionClient,
  recoverApplicationSession,
} from './helpers/application-session-client.mjs';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `supervised fills keep separate confirmations through ${type}`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationFixture();
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        let receipt = await api.vacancyApplicationOpen({
          ...applicationInput,
          ...supervisedOptions,
        });
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'enter', confirm: true })
        );
        const combined = await wirePost(
          base,
          'application-prefill',
          identity(receipt, { confirm: true }),
          type
        );
        assert.equal(combined.status, 400);
        assert.equal(combined.value.code, 'jobs-application-confirmation');
        const stale = receipt;
        receipt = await api.vacancyApplicationPrefill(
          identity(receipt, { part: 'answers', confirm: true })
        );
        assert.equal(fixture.state.page.letter, null);
        const refused = await wirePost(
          base,
          'application-prefill',
          identity(stale, { part: 'cover-letter', confirm: true }),
          type
        );
        assert.equal(refused.status, 409);
        receipt = await api.vacancyApplicationPrefill(
          identity(receipt, { part: 'cover-letter', confirm: true })
        );
        assert.equal(receipt.letter, 'verified');
        assert.equal(receipt.supervised, true);
        assert.equal(fixture.state.submitted, 0);
        receipt = await api.vacancyApplicationAdvance(
          identity(receipt, { action: 'submit', confirm: true })
        );
        assert.equal(receipt.delivery, 'provider-confirmed');
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'supervised CLI stops after its first confirmed delivery and drains its input and browser',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    let drained = false;
    const actions = async function* () {
      try {
        yield 'enter';
        yield 'answers';
        assert.equal(fixture.state.page.letter, null);
        assert.equal(fixture.state.submitted, 0);
        yield 'submit'; // No configured letter; explicit send remains separate.
        assert.fail(
          'A completed supervised command must not request another action.'
        );
      } finally {
        drained = true;
      }
    };
    const result = await runApplicationFixtureCommand(fixture, actions, {
      supervised: 'true',
      'auto-exact': 'true',
    });
    assert.equal(result.status, 0);
    assert.equal(result.output.at(-1).delivery, 'provider-confirmed');
    assert.equal(result.output.at(-1).autoExact, false);
    assert.equal(fixture.state.submitted, 1);
    assert.equal(fixture.state.closed, 1);
    assert.equal(drained, true);
  }
);

test(
  'supervised CLI counts native immediate-entry delivery and does not read another action',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture({
      application: {
        dispatch: async () => {
          fixture.state.entered++;
          fixture.state.page.delivered = true;
          return { dispatched: true };
        },
      },
    });
    t.after(() => fixture.close());
    const result = await runApplicationFixtureCommand(
      fixture,
      async function* () {
        yield 'enter';
        assert.fail('HH already confirmed delivery at entry.');
      },
      { supervised: true }
    );
    assert.equal(result.output.at(-1).delivery, 'provider-confirmed');
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'an uncertain supervised CLI dispatch remains unknown and accepts read-only recovery',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture({
      application: {
        dispatch: async () => {
          throw new Error('Finite lost native entry response');
        },
      },
    });
    t.after(() => fixture.close());
    let continued = false;
    const result = await runApplicationFixtureCommand(
      fixture,
      async function* () {
        yield 'enter';
        continued = true;
        yield 'status';
      },
      { supervised: true }
    );
    assert.equal(continued, true);
    assert.equal(result.output.at(-1).delivery, 'unknown');
    assert.equal(result.output.at(-1).attempted.enter, true);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'a lost supervised answer reply recovers only by status with its frozen preset and without filling the letter',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const client = applicationSessionClient(fixture);
    await client.session.select(applicationInput);
    await client.session.start(supervisedOptions);
    await client.session.action('Advance', { action: 'enter', confirm: true });
    const prefill = client.api.vacancyApplicationPrefill;
    client.api.vacancyApplicationPrefill = async (input) => {
      await prefill(input);
      throw new Error('Finite lost supervised fill reply');
    };
    await assert.rejects(
      client.session.action('Prefill', { part: 'answers', confirm: true })
    );
    const recovered = await recoverApplicationSession(fixture, client.saved);
    const receipt = recovered.session.state.receipt;
    assert.equal(receipt.supervised, true);
    assert.equal(receipt.autoExact, false);
    assert.equal(fixture.state.page.letter, null);
    assert.equal(fixture.state.writes.length, 1);
    assert.equal(fixture.state.submitted, 0);
    const saved = JSON.parse([...client.saved.values.values()][0]);
    assert.deepEqual(Object.keys(saved).sort(), [
      'browserSlot',
      'requestId',
      'url',
    ]);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { receipt, intent: recovered.session.state.intent },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'supervisedHint',
        'answers',
        'letter',
      ]);
      assert(!markup.includes('data-application-action="prefill"'));
      assert.match(markup, /data-application-action="answers" disabled=""/u);
      assert.match(markup, /data-application-action="letter" disabled=""/u);
    }
  }
);
