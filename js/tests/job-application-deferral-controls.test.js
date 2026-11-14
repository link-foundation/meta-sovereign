import {
  applicationRouteApi,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationSessionClient as client } from './helpers/application-session-client.mjs';
import { withRoutes } from './helpers/vacancy-routes.mjs';
import {
  applicationDeferralFixture,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';

test(
  'foreground CLI preserves actual answers, lists the RAM queue and explicitly reopens without sending before draining at EOF',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationDeferralFixture();
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'CLI deferred actual answer';
      yield 'read';
      yield 'defer';
      yield 'queue';
      yield 'retry';
      assert.equal(fixture.state.fields[1].value, '');
      assert.equal(fixture.state.writes.length, 0);
      yield 'read';
      yield 'restore';
    };
    t.after(() => fixture.close());
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(
      ['defer', 'queue', 'retry'].every((name) =>
        output[1].commands.includes(name)
      )
    );
    assert.equal(
      output.find((row) => row.mode === 'hh-application-queue').entries.length,
      1
    );
    assert.equal(output.at(-1).restoration.state, 'restored');
    assert.equal(fixture.state.fields[1].value, 'CLI deferred actual answer');
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 2);
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `deferral and fresh-review retry cross the actual browser API and HTTP ${type} boundary`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationDeferralFixture();
      t.after(() => fixture.close());
      await withRoutes(
        async (base) => {
          const api = applicationRouteApi(base, type);
          let receipt = await api.vacancyApplicationOpen(applicationInput);
          receipt = await api.vacancyApplicationAdvance(
            identity(receipt, { action: 'enter', confirm: true })
          );
          fixture.state.fields[1].value = 'Actual transport answer';
          receipt = await api.vacancyApplicationRead(identity(receipt));
          receipt = await api.vacancyApplicationDefer(
            identity(receipt, { confirm: true })
          );
          assert.equal(receipt.state, 'closed');
          const queue = await api.vacancyApplicationQueue({
            browserSlot: 'jobs',
          });
          assert.equal(queue.entries.length, 1);
          receipt = await api.vacancyApplicationRetry({
            ...queue.entries[0],
            queueId: queue.entries[0].id,
            confirm: true,
          });
          assert.equal(receipt.state, 'review');
          assert.equal(
            receipt.draft.fields[0].value,
            'Actual transport answer'
          );
          assert.equal(
            (await api.vacancyApplicationQueue({})).entries.length,
            0
          );
          assert.equal(fixture.state.fields[1].value, '');
          assert.equal(fixture.state.writes.length, 0);
          assert.equal(fixture.state.submitted, 0);
          await api.vacancyApplicationClose(identity(receipt));
        },
        { store: fixture.store, service: fixture.serviceOptions }
      );
    }
  );
}

test(
  'lost deferral and retry replies recover by identity without replay or storing queue reasons in the browser',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationDeferralFixture();
    const value = client(fixture);
    t.after(() => fixture.close());
    await value.session.select(applicationInput);
    await value.session.start({});
    await value.session.action('Advance', { action: 'enter', confirm: true });
    fixture.state.fields[1].value = 'Private controller answer';
    await value.session.action('Read');
    const defer = value.api.vacancyApplicationDefer;
    value.api.vacancyApplicationDefer = async (input) => {
      await defer(input);
      throw new Error('Lost deferral response');
    };
    await assert.rejects(value.session.action('Defer', { confirm: true }));
    assert.equal(value.session.state.known, false);
    await assert.rejects(value.session.action('Defer', { confirm: true }));
    await value.session.recover();
    assert.equal(value.session.state.receipt.active, false);
    await value.session.release();
    const queue = await value.session.refreshQueue({});
    const retry = value.api.vacancyApplicationRetry;
    value.api.vacancyApplicationRetry = async (input) => {
      await retry(input);
      throw new Error('Lost retry response');
    };
    await assert.rejects(value.session.retry(queue.entries[0]));
    assert.equal(value.session.state.known, false);
    assert.throws(() => value.session.retry(queue.entries[0]));
    const recovered = client(fixture, value.saved);
    await recovered.session.recover();
    assert.equal(recovered.session.state.receipt.state, 'review');
    assert.equal(
      recovered.session.state.receipt.draft.fields[0].value,
      'Private controller answer'
    );
    assert.deepEqual(
      recovered.calls.map(([name]) => name),
      ['status']
    );
    const saved = JSON.parse([...value.saved.values.values()][0]);
    assert.deepEqual(Object.keys(saved).sort(), [
      'browserSlot',
      'requestId',
      'url',
    ]);
    assert.equal(fixture.state.opened, 2);
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'queue receipts reject foreign slots, duplicate vacancies, malformed identity and replies that do not confirm a queue',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationDeferralFixture();
    t.after(() => fixture.close());
    await fixture.defer(await fixture.answered());
    const queue = await fixture.queue();
    const entry = queue.entries[0];
    for (const raw of [
      null,
      { ...queue, ok: false },
      { ...queue, revision: 'stale' },
      { ...queue, browserSlot: 'other' },
      {
        ...queue,
        entries: [entry, { ...entry, id: globalThis.crypto.randomUUID() }],
      },
      ...[
        { browserSlot: undefined },
        { requestId: '' },
        { reason: 'sent' },
        { queuedAt: 'bad' },
        { url: 'https://example.test/vacancy/123' },
      ].map((change) => ({ ...queue, entries: [{ ...entry, ...change }] })),
    ]) {
      assert.throws(() => applicationQueueResult(raw));
    }
    assert.equal(fixture.state.opened, 1);
  }
);

test(
  'four-language application panels expose backed deferral and require fresh confirmation for queue reopening',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationDeferralFixture();
    t.after(() => fixture.close());
    const receipt = await fixture.defer(await fixture.answered());
    const queue = await fixture.queue();
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        {
          receipt,
          queue,
          intent: null,
          target: identity(receipt),
          options: {},
        },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'defer',
        'queueTitle',
        'queueHint',
        'queueRead',
        'retry',
      ]);
      assert.match(markup, /data-application-action="retry" disabled=""/u);
      assert.match(
        markup,
        /data-application-queued="https:\/\/hh.ru\/vacancy\/123"/u
      );
    }
  }
);
