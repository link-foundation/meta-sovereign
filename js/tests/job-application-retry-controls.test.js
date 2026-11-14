import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applicationRetryFixture,
  queuedGenericApplication,
} from '../../experiments/issue-56/application-retry-fixture.mjs';
import { identity } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationRetryMs } from '../src/jobs/application-retries.js';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  applicationSessionClient,
  recoverApplicationSession,
} from './helpers/application-session-client.mjs';
import {
  assertApplicationReviewOnly,
  withApplicationRouteFixture,
  enterApplicationRoute,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';
import { wirePost } from './helpers/vacancy-routes.mjs';
import { ApplicationQueueView } from '../src/web/application-queue-view.js';
import { translate } from '../src/web/i18n.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `generic retry timing crosses the actual ${type} routes without restoring or sending`,
    { timeout: 10000 },
    async (t) => {
      const fixture = applicationRetryFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api, base) => {
        let receipt = await enterApplicationRoute(api);
        fixture.state.fields[1].value = 'Actual transport retry answer';
        fixture.state.page.error = 'generic-error';
        receipt = await api.vacancyApplicationRead(identity(receipt));
        assert.equal(receipt.state, 'closed');
        let queue = await api.vacancyApplicationQueue({});
        const entry = queue.entries[0];
        assert.equal(entry.ready, false);
        const input = { ...identity(entry), queueId: entry.id, confirm: true };
        const early = await wirePost(base, 'application-retry', input, type);
        assert.equal(early.status, 400);
        assert.equal(early.value.code, 'jobs-application-retry-wait');
        assert.equal(fixture.state.opened, 1);
        fixture.clock.value += applicationRetryMs;
        queue = await api.vacancyApplicationQueue({});
        assert.equal(queue.entries[0].ready, true);
        receipt = await api.vacancyApplicationRetry(input);
        assertApplicationReviewOnly(
          fixture,
          receipt,
          'Actual transport retry answer'
        );
        await api.vacancyApplicationClose(identity(receipt));
      });
    }
  );
}

test(
  'CLI refuses an early generic retry and opens a due fresh review before separately restoring',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const actions = async function* () {
      yield 'enter';
      fixture.state.fields[1].value = 'Private CLI retry answer';
      fixture.state.page.error = 'generic-error';
      yield 'read';
      yield 'queue';
      yield 'retry';
      assert.equal(fixture.state.opened, 1);
      fixture.clock.value += applicationRetryMs;
      yield 'queue';
      yield 'retry';
      assert.equal(fixture.state.fields[1].value, '');
      assert.equal(fixture.state.writes.length, 0);
      yield 'restore';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    const failure = output.filter((row) => row.ok === false);
    assert.equal(failure.length, 1);
    assert.equal(failure[0].code, 'jobs-application-retry-wait');
    assert.equal(output.at(-1).restoration.applied, 1);
    assert.equal(fixture.state.fields[1].value, 'Private CLI retry answer');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 2);
  }
);

test(
  'lost generic-rejection replies recover read-only and never persist retry timing or answers in browser storage',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const client = applicationSessionClient(fixture);
    await client.session.select(applicationInput);
    await client.session.start({});
    await client.session.action('Advance', { action: 'enter', confirm: true });
    fixture.state.fields[1].value = 'Private browser retry answer';
    await client.session.action('Read');
    fixture.state.rejectSubmission = 'generic-error';
    const advance = client.api.vacancyApplicationAdvance;
    client.api.vacancyApplicationAdvance = async (input) => {
      await advance(input);
      throw new Error('Finite lost generic rejection response');
    };
    await assert.rejects(
      client.session.action('Advance', { action: 'submit', confirm: true })
    );
    const recovered = await recoverApplicationSession(fixture, client.saved);
    assert.equal(recovered.session.state.receipt.delivery, 'unknown');
    assert.equal(recovered.session.state.receipt.active, false);
    let queue = await recovered.session.refreshQueue({});
    assert.throws(() => recovered.session.retry(queue.entries[0]));
    fixture.clock.value += applicationRetryMs;
    queue = await recovered.session.refreshQueue({});
    const review = await recovered.session.retry(queue.entries[0]);
    assert.equal(review.state, 'review');
    assert.equal(review.attempted.submit, false);
    assert.equal(fixture.state.submitted, 1);
    assert.equal(fixture.state.writes.length, 0);
    assert.deepEqual(
      Object.keys(JSON.parse([...client.saved.values.values()][0])).sort(),
      ['browserSlot', 'requestId', 'url']
    );
  }
);

test(
  'all four locales render server-clock retry eligibility and retain separate confirmation',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    const render = (queue, locale, confirmed) =>
      renderToStaticMarkup(
        React.createElement(ApplicationQueueView, {
          application: {
            queue,
            known: true,
            receipt: null,
            intent: null,
            target: null,
          },
          idle: true,
          confirmed,
          t: (key, values) => translate(locale, key, values),
        })
      );
    const waiting = await fixture.queue();
    fixture.clock.value += applicationRetryMs;
    const due = await fixture.queue();
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const early = render(waiting, locale, true);
      assert.match(early, /data-application-action="retry" disabled=""/u);
      assert(
        early.includes(
          translate(locale, 'application.retryWaiting', {
            at: waiting.entries[0].retryAt,
          })
        )
      );
      assert(
        early.includes(
          `data-application-retry-at="${waiting.entries[0].retryAt}"`
        )
      );
      const ready = render(due, locale, true);
      assert(
        ready.includes(
          translate(locale, 'application.retryReady', {
            at: due.entries[0].retryAt,
          })
        )
      );
      assert(!ready.includes('data-application-action="retry" disabled'));
      assert(
        render(due, locale, false).includes(
          'data-application-action="retry" disabled'
        )
      );
      assert(!early.includes('application.retryWaiting'));
    }
  }
);

test(
  'generic retry receipts reject missing, malformed or unconfirmed timing',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    const queue = await fixture.queue();
    for (const change of [
      { ready: undefined },
      { ready: 'true' },
      { retryAt: undefined },
      { retryAt: 'unknown' },
      { reason: 'delivered' },
    ]) {
      assert.throws(() =>
        applicationQueueResult({
          ...queue,
          entries: [{ ...queue.entries[0], ...change }],
        })
      );
    }
  }
);
