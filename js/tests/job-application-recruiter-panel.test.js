import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationBatchFixture,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { originalApplicationSearch } from '../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationDelay } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  closedApplicationFixtureCommand,
  withApplicationRouteFixture,
} from './helpers/application-controls.mjs';

const recruiterPanelFixture = (t, application = {}) =>
  applicationBatchFixture(t, {
    application,
    vacancyPage: (state) => {
      Object.assign(state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
    },
  });

const review = (fixture, state) =>
  fixture.until(
    (row) =>
      row.batch.delivered === 1 && row.application?.recruiterChat === state
  );

test('a confirmed batch holds the owned recruiter panel at its delivery cap', async (t) => {
  const fixture = recruiterPanelFixture(t);
  await fixture.start({ maxApplications: 1 });
  const opened = await review(fixture, 'open');
  assert.equal(opened.batch.phase, 'review');
  assert.equal(opened.batch.cursor, 1);
  assert.equal(opened.application.delivery, 'provider-confirmed');
  assert.equal(fixture.state.closed, 0);
  assert.equal(fixture.state.submitted, 0);
  assert.deepEqual(
    fixture.state.admissions.map(({ url }) => url),
    [batchUrls[0]]
  );

  fixture.state.page.recruiterPanelOpen = false;
  const completed = await fixture.until(
    (row) => row.batch.phase === 'completed'
  );
  assert.equal(completed.batch.delivered, 1);
  assert.equal(fixture.state.closed, 1);
  assert.equal(fixture.state.submitted, 0);
});

test('an unverified page cannot clear a visible recruiter panel hold', async (t) => {
  const fixture = recruiterPanelFixture(t);
  await fixture.start({ maxApplications: 1 });
  await review(fixture, 'open');
  fixture.state.page.bound = false;
  fixture.state.page.url = 'https://hh.ru/chat/456';
  delete fixture.state.page.recruiterPanelOpen;
  const changed = await review(fixture, 'unverified');
  assert.equal(changed.batch.phase, 'review');
  assert.equal(fixture.state.closed, 0);

  await fixture.stop();
  const stopped = await fixture.status();
  assert.equal(stopped.batch.phase, 'stopped');
  assert.equal(stopped.application.active, true);
  assert.equal(stopped.application.recruiterChat, 'unverified');
  assert.equal(fixture.state.closed, 0);
});

test('a replaced recruiter chat is unverified until the same vacancy returns', async (t) => {
  let sameVacancy = true;
  const fixture = recruiterPanelFixture(t, {
    readRecruiterPanel: async () => ({ matched: sameVacancy }),
  });
  await fixture.start({ maxApplications: 1 });
  const matched = await review(fixture, 'open');

  sameVacancy = false;
  const changed = await review(fixture, 'unverified');
  assert.notEqual(changed.application.revision, matched.application.revision);
  assert.equal(changed.application.delivery, 'provider-confirmed');
  assert.equal(fixture.state.closed, 0);
  assert.equal(fixture.state.submitted, 0);

  sameVacancy = true;
  await review(fixture, 'open');
  fixture.state.page.recruiterPanelOpen = false;
  await fixture.until((row) => row.batch.phase === 'completed');
  assert.equal(fixture.state.closed, 1);
});

const returnedSearchFixture = async (t) => {
  let returns = 0;
  const fixture = applicationBatchFixture(t, {
    application: {
      batchWait: (_ms, signal) => applicationDelay(3, signal),
      attachmentDocument: async (_browser, record, action, guard) => {
        if (action === 'returnSearch') {
          assert.equal(guard, JSON.stringify(fixture.state.page));
          returns += 1;
          Object.assign(fixture.state.page, {
            url: record.options.applicationSearchUrl,
            documentKey: 'returned-search',
            delivered: false,
            attachmentSearch: true,
            recruiterPanelOpen: false,
            returnSafe: true,
          });
          return { navigated: true };
        }
        assert.equal(action, undefined);
        return globalThis.structuredClone(fixture.state.page);
      },
    },
  });
  await fixture.start({
    confirmations: ['send'],
    maxApplications: 1,
    applicationSearchUrl: originalApplicationSearch,
  });
  await fixture.until((row) => row.application?.continuation?.step === 'send');
  // The owner clicked Send in HeadHunter. Only provider proof changes shape.
  Object.assign(fixture.state.page, {
    delivered: true,
    questions: false,
    scope: false,
    submit: null,
  });
  const waiting = await fixture.until(
    (row) => row.batch.delivered === 1 && row.batch.nextAt !== null
  );
  assert.equal(waiting.batch.phase, 'review');
  assert.equal(waiting.application.delivery, 'provider-confirmed');
  assert.equal(waiting.application.page.url, originalApplicationSearch);
  assert.equal(fixture.state.closed, 0);
  assert.equal(fixture.state.submitted, 0);
  assert.equal(returns, 1);
  const deadline = Date.parse(waiting.batch.nextAt);
  assert.equal(deadline - fixture.state.clock, 10_000);
  return { fixture, deadline, returns: () => returns };
};

test('a manually confirmed application returns and waits for a late recruiter panel', async (t) => {
  const { fixture, deadline, returns } = await returnedSearchFixture(t);
  fixture.state.clock = deadline - 1;
  fixture.state.page.recruiterPanelOpen = true;
  const opened = await fixture.until(
    (row) =>
      row.application?.recruiterChat === 'open' && row.batch.nextAt === null
  );
  assert.equal(opened.batch.phase, 'review');
  assert.equal(fixture.state.closed, 0);
  fixture.state.page.recruiterPanelOpen = false;
  const finished = await fixture.until(
    (row) => row.batch.phase === 'completed'
  );
  assert.equal(finished.batch.delivered, 1);
  assert.equal(fixture.state.closed, 1);
  assert.equal(returns(), 1);
});

test('a search with no recruiter panel closes after the bounded wait', async (t) => {
  const { fixture, deadline, returns } = await returnedSearchFixture(t);
  fixture.state.clock = deadline;
  const completed = await fixture.until(
    (row) => row.batch.phase === 'completed'
  );
  assert.equal(completed.batch.delivered, 1);
  assert.equal(completed.batch.nextAt, null);
  assert.equal(fixture.state.closed, 1);
  assert.equal(fixture.state.submitted, 0);
  assert.equal(returns(), 1);
});

test('Stop ends the late-panel wait without closing the owner’s search', async (t) => {
  const { fixture, deadline, returns } = await returnedSearchFixture(t);
  await fixture.stop();
  fixture.state.clock = deadline;
  const stopped = await fixture.status();
  assert.equal(stopped.batch.phase, 'stopped');
  assert.equal(stopped.batch.nextAt, null);
  assert.equal(stopped.application.delivery, 'provider-confirmed');
  assert.equal(fixture.state.closed, 0);
  assert.equal(fixture.state.submitted, 0);
  assert.equal(returns(), 1);
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`an observed recruiter panel dismissal survives ${type} recovery`, async (t) => {
    const fixture = applicationFixture({
      application: {
        readRecruiterPanel: async (_browser, _vacancy, { dismissal }) => {
          dismissal.check();
          assert.equal(Boolean(dismissal.defer), false);
          fixture.state.page.recruiterPanelOpen = false;
          return { matched: false, dismissed: 'completed' };
        },
      },
    });
    t.after(() => fixture.close());
    await withApplicationRouteFixture(fixture, type, async (api) => {
      const opened = await api.vacancyApplicationOpen(applicationInput);
      assert.throws(() =>
        applicationResult(
          { ...opened, recruiterDismissal: 'completed' },
          applicationInput
        )
      );
      Object.assign(fixture.state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
      const receipt = await api.vacancyApplicationRead({
        ...applicationInput,
        revision: opened.revision,
      });
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(receipt.recruiterChat, undefined);
      assert.equal(receipt.recruiterDismissal, 'completed');
      await api.vacancyApplicationClose({
        ...applicationInput,
        revision: receipt.revision,
      });
      const saved = await api.vacancyApplicationStatus(applicationInput);
      assert.equal(saved.active, false);
      assert.equal(saved.recruiterDismissal, 'completed');
    });
  });

  test(`only a live confirmed receipt exposes recruiter review through ${type}`, async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    await withApplicationRouteFixture(fixture, type, async (api) => {
      const opened = await api.vacancyApplicationOpen(applicationInput);
      Object.assign(fixture.state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
      const receipt = await api.vacancyApplicationRead({
        ...applicationInput,
        revision: opened.revision,
      });
      assert.equal(receipt.recruiterChat, 'open');
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(Object.hasOwn(receipt.page, 'recruiterPanelOpen'), false);
      assert.throws(() =>
        applicationResult(
          { ...opened, recruiterChat: 'open' },
          applicationInput
        )
      );
      const closed = await api.vacancyApplicationClose({
        ...applicationInput,
        revision: receipt.revision,
      });
      assert.equal(closed.recruiterChat, undefined);
      assert.equal(closed.delivery, 'provider-confirmed');
    });
  });

  test(`a verified or uncertain automatic recruiter reply survives ${type} recovery`, async (t) => {
    let reply = 'provider-confirmed';
    const fixture = applicationFixture({
      application: {
        readRecruiterPanel: async (_browser, _vacancy, { review }) => {
          assert.equal(review.autoSendExactAnswers, true);
          return { matched: true, reply };
        },
      },
    });
    t.after(() => fixture.close());
    await withApplicationRouteFixture(fixture, type, async (api) => {
      const input = { ...applicationInput, autoSendExactAnswers: true };
      const opened = await api.vacancyApplicationOpen(input);
      assert.equal(opened.autoSendExactAnswers, true);
      assert.equal(opened.recruiterReply, undefined);
      assert.throws(() =>
        applicationResult({ ...opened, recruiterReply: reply }, input)
      );
      Object.assign(fixture.state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
      const delivered = await api.vacancyApplicationRead({
        ...input,
        revision: opened.revision,
      });
      assert.equal(delivered.recruiterReply, 'provider-confirmed');
      reply = 'unknown';
      const uncertain = await api.vacancyApplicationRead({
        ...input,
        revision: delivered.revision,
      });
      assert.notEqual(uncertain.revision, delivered.revision);
      assert.equal(uncertain.delivery, 'provider-confirmed');
      assert.equal(uncertain.recruiterReply, 'unknown');
      await api.vacancyApplicationClose({
        ...input,
        revision: uncertain.revision,
      });
      const saved = await api.vacancyApplicationStatus(input);
      assert.equal(saved.active, false);
      assert.equal(saved.recruiterChat, undefined);
      assert.equal(saved.recruiterReply, 'unknown');
    });
  });
}

test('the CLI opts into recruiter replies separately and suppresses them in protected modes', async (t) => {
  for (const args of [
    {},
    { 'auto-send-exact-answers': 'false' },
    { 'auto-send-exact-answers': 'true', supervised: 'true' },
    { 'auto-send-exact-answers': 'true', 'test-mode': 'true' },
  ]) {
    const receipt = await closedApplicationFixtureCommand(t, args);
    assert.equal(receipt.autoSendExactAnswers, undefined);
  }
  const receipt = await closedApplicationFixtureCommand(t, {
    'auto-send-exact-answers': 'true',
  });
  assert.equal(receipt.autoSendExactAnswers, true);
  assert.equal(receipt.autoExact, false);
});

test('the application CLI opts into prior-answer reuse independently and leaves it off in protected modes', async (t) => {
  for (const args of [
    {},
    { 'auto-reuse-answers': 'false' },
    { 'auto-reuse-answers': 'true', supervised: 'true' },
    { 'auto-reuse-answers': 'true', 'test-mode': 'true' },
  ]) {
    const result = await closedApplicationFixtureCommand(t, args);
    assert.equal(result.autoReuseAnswers, undefined);
  }
  const result = await closedApplicationFixtureCommand(t, {
    'auto-reuse-answers': 'true',
  });
  assert.equal(result.autoReuseAnswers, true);
  assert.equal(result.autoSendExactAnswers, undefined);
  assert.equal(result.autoExact, false);
});
