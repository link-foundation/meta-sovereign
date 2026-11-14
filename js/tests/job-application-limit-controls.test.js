import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitFixture } from '../../experiments/issue-56/application-limit-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationLimitMs } from '../src/jobs/application-limit-data.js';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { wirePost } from './helpers/vacancy-routes.mjs';
import {
  withApplicationRouteFixture,
  enterApplicationRoute,
  successfulApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';
import {
  applicationSessionClient,
  recoverApplicationSession,
} from './helpers/application-session-client.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `durable limit status and refusal cross actual ${type} application routes`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationLimitFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.page.dailyLimit = true;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        const until = receipt.applicationLimit.until;
        fixture.state.page.dailyLimit = false;
        receipt = await api.vacancyApplicationRead(identity(receipt));
        const queue = await api.vacancyApplicationQueue({
          browserSlot: 'other',
        });
        assert.equal(queue.applicationLimit.until, until);
        const result = await wirePost(
          base,
          'application-prefill',
          identity(receipt, { confirm: true }),
          type
        );
        assert.equal(result.status, 400);
        assert.equal(result.value.code, 'jobs-application-limit-wait');
        assert.equal(fixture.state.writes.length, 0);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'CLI reports one stable deadline, refuses a dismissed pause and keeps manual holds after expiry',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.page.dailyLimit = true;
      yield 'read';
      fixture.state.page.dailyLimit = false;
      yield 'read';
      yield 'prefill';
      assert.equal(fixture.state.writes.length, 0);
      fixture.clock.value += applicationLimitMs;
      yield 'read';
      yield 'prefill';
    };
    const output = await successfulApplicationFixtureCommand(fixture, actions);
    assert.deepEqual(
      output.filter((row) => row.ok === false).map((row) => row.code),
      ['jobs-application-limit-wait']
    );
    const held = output.filter((row) => row.applicationLimit);
    assert.equal(
      new Set(held.map((row) => row.applicationLimit.until)).size,
      1
    );
    assert.equal(held.at(-1).applicationLimit.active, false);
    assert.equal(held.at(-1).hold, 'daily-limit');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'a lost limit response recovers by status and all locales gate writes without browser-stored deadlines',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitFixture(t);
    const client = applicationSessionClient(fixture);
    await client.session.select(applicationInput);
    await client.session.start({ supervised: true });
    await client.session.action('Advance', { action: 'enter', confirm: true });
    fixture.state.page.dailyLimit = true;
    const read = client.api.vacancyApplicationRead;
    client.api.vacancyApplicationRead = async (input) => {
      await read(input);
      throw new Error('Finite lost limit response');
    };
    await assert.rejects(client.session.action('Read'));
    fixture.state.page.dailyLimit = false;
    const recovered = await recoverApplicationSession(fixture, client.saved);
    await recovered.session.action('Read');
    const { receipt } = recovered.session.state;
    assert.equal(receipt.applicationLimit.active, true);
    assert.equal(receipt.state, 'review');
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { ...recovered.session.state, options: {}, confirm: true },
        locale
      );
      assert.match(markup, /data-application-limit="waiting"/u);
      assert(markup.includes(receipt.applicationLimit.until));
      for (const action of ['answers', 'letter', 'submit', 'restore']) {
        assert.match(
          markup,
          new RegExp(`data-application-action="${action}" disabled=""`, 'u')
        );
      }
      for (const suffix of [
        'limitWaiting',
        'limitElapsed',
        'limitScope',
        'limitUnsaved',
      ]) {
        assertApplicationTranslation(locale, suffix);
      }
      const unsaved = applicationPanelMarkup(
        {
          ...recovered.session.state,
          receipt: {
            ...receipt,
            applicationLimit: { ...receipt.applicationLimit, saved: false },
          },
          options: {},
        },
        locale
      );
      assert.match(unsaved, /role="alert"/u);
      assert(
        unsaved.includes(assertApplicationTranslation(locale, 'limitUnsaved'))
      );
    }
    const saved = JSON.parse([...client.saved.values.values()][0]);
    assert.deepEqual(Object.keys(saved).sort(), [
      'browserSlot',
      'requestId',
      'url',
    ]);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.writes.length, 0);
    const queue = await fixture.service['application-queue']({});
    assert.throws(
      () =>
        applicationQueueResult(
          {
            ...queue,
            applicationLimit: { ...queue.applicationLimit, saved: 'yes' },
          },
          {}
        ),
      { code: 'jobs-application-limit-journal' }
    );
  }
);
