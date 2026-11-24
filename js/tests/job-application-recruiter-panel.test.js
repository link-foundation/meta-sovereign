import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationBatchFixture,
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationBatchCommand } from '../src/cli/application-batch-command.js';
import { originalApplicationSearch } from '../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationDelay } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { decodeWire, LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { wirePost } from './helpers/vacancy-routes.mjs';
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

test('the paced CLI uses s to leave the displayed recruiter question and continue the batch', async (t) => {
  let closes = 0;
  const fixture = recruiterPanelFixture(t, {
    readRecruiterPanel: async (_browser, _vacancy, { skip, offerSkip }) => {
      if (!skip) {
        return {
          matched: true,
          ...(offerSkip && { skipCapture: 'chat:456:1' }),
        };
      }
      assert.equal(skip.capture, 'chat:456:1');
      skip.check();
      closes++;
      fixture.state.page.recruiterPanelOpen = false;
      return { matched: false, dismissed: 'skipped' };
    },
  });
  const output = [];
  const stream = async function* () {
    await fixture.until((result) => result.application?.recruiterSkipTarget);
    yield 'status';
    yield 's';
    await fixture.until((result) => result.batch.phase === 'completed');
  };
  assert.equal(
    await applicationBatchCommand(
      fixture.service,
      { ...batchInput, maxApplications: 1 },
      (line) => output.push(decodeWire(line)),
      stream
    ),
    0
  );
  assert.equal(closes, 1);
  assert.ok(output.some((row) => row.recruiterDismissal === 'skipped'));
  assert.equal(fixture.state.submitted, 0);
});

test('Stop before native admission preserves the displayed recruiter panel', async (t) => {
  const observing = Promise.withResolvers();
  const continueRead = Promise.withResolvers();
  let closes = 0;
  const fixture = recruiterPanelFixture(t, {
    batchWait: (ms, signal) => applicationDelay(ms ? 80 : 0, signal),
    readRecruiterPanel: async (_browser, _vacancy, { skip, offerSkip }) => {
      if (skip) {
        observing.resolve();
        await continueRead.promise;
        skip.check();
        closes++;
      }
      return { matched: true, ...(offerSkip && { skipCapture: 'chat:456:1' }) };
    },
  });
  await fixture.start({ maxApplications: 1 });
  const { application } = await review(fixture, 'open');
  const action = fixture.service['application-advance']({
    ...application,
    action: 'skip-recruiter',
    confirm: true,
  });
  const refused = assert.rejects(action, { code: 'jobs-application-changed' });
  try {
    await Promise.race([observing.promise, action]);
  } finally {
    const stop = fixture.stop();
    continueRead.resolve();
    await refused;
    assert.equal((await stop).batch.phase, 'stopped');
  }
  assert.equal(closes, 0);
  assert.equal(fixture.state.page.recruiterPanelOpen, true);
  assert.equal(
    (await fixture.status()).application.recruiterDismissal,
    undefined
  );
});

test('a failed Skip acknowledgement recovers by reading without another close', async (t) => {
  let closes = 0;
  const fixture = applicationFixture({
    application: {
      readRecruiterPanel: async (_browser, _vacancy, { skip, offerSkip }) => {
        if (skip) {
          skip.check();
          closes++;
          fixture.state.page.recruiterPanelOpen = false;
          return { matched: false, dismissed: 'skipped' };
        }
        return {
          matched: true,
          ...(offerSkip && { skipCapture: 'chat:456:1' }),
        };
      },
    },
  });
  t.after(() => fixture.close());
  const service = fixture.service;
  const opened = await service['application-open'](applicationInput);
  Object.assign(fixture.state.page, {
    delivered: true,
    enter: null,
    recruiterPanelOpen: true,
  });
  const read = () =>
    service['application-read']({
      ...applicationInput,
      revision: opened.revision,
    });
  const pending = await read();
  const put = fixture.store.put.bind(fixture.store);
  fixture.store.put = async (row) => {
    if (row.recruiterDismissal === 'skipped') {
      throw new Error('finite Skip acknowledgement refusal');
    }
    return put(row);
  };
  const skip = {
    ...applicationInput,
    action: 'skip-recruiter',
    confirm: true,
    revision: pending.revision,
    recruiterSkipTarget: pending.recruiterSkipTarget,
  };
  try {
    await assert.rejects(
      service['application-advance'](skip),
      /Skip acknowledgement refusal/u
    );
  } finally {
    fixture.store.put = put;
  }
  assert.equal(
    (await service['application-status'](applicationInput)).recruiterDismissal,
    undefined
  );
  const recovered = await service['application-read'](skip);
  assert.equal(recovered.recruiterDismissal, 'skipped');
  assert.equal(recovered.delivery, 'provider-confirmed');
  assert.equal(closes, 1);
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
  test(`recruiter Skip is bound to the current question and persists through ${type}`, async (t) => {
    let capture = 'first captured question';
    let skips = 0;
    const fixture = applicationFixture({
      application: {
        readRecruiterPanel: async (_browser, _vacancy, options) => {
          const { skip, offerSkip, review, dismissal } = options;
          if (skip) {
            assert.equal(review, undefined);
            assert.equal(dismissal, undefined);
            skip.check();
            if (capture === skip.capture) {
              skips++;
              fixture.state.page.recruiterPanelOpen = false;
              return { matched: false, dismissed: 'skipped' };
            }
          }
          return { matched: true, ...(offerSkip && { skipCapture: capture }) };
        },
      },
    });
    t.after(() => fixture.close());
    await withApplicationRouteFixture(fixture, type, async (api, base) => {
      const opened = await api.vacancyApplicationOpen(applicationInput);
      Object.assign(fixture.state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
      const pending = await api.vacancyApplicationRead({
        ...applicationInput,
        revision: opened.revision,
      });
      assert.equal(pending.recruiterChat, 'open');
      assert.ok(pending.recruiterSkipTarget);
      assert.throws(() =>
        applicationResult({ ...pending, paused: true }, applicationInput)
      );
      assert.throws(() =>
        applicationResult(
          { ...pending, recruiterSkipTarget: '-'.repeat(36) },
          applicationInput
        )
      );
      const skip = {
        ...applicationInput,
        action: 'skip-recruiter',
        confirm: true,
        revision: pending.revision,
        recruiterSkipTarget: pending.recruiterSkipTarget,
      };
      const refuse = async (input, code) => {
        const rejected = await wirePost(
          base,
          'application-advance',
          input,
          type
        );
        assert.equal(rejected.value.code, code);
        assert.equal(skips, 0);
      };
      await refuse(
        { ...skip, confirm: false },
        'jobs-application-confirmation'
      );
      await refuse(
        { ...skip, automatic: true },
        'jobs-application-confirmation'
      );
      await refuse(
        { ...skip, automatic: null },
        'jobs-application-confirmation'
      );
      capture = 'a newer native question';
      await refuse(skip, 'jobs-application-changed');
      const current = await api.vacancyApplicationStatus(applicationInput);
      assert.notEqual(current.recruiterSkipTarget, pending.recruiterSkipTarget);
      await refuse(
        { ...skip, revision: current.revision },
        'jobs-application-changed'
      );
      const result = await api.vacancyApplicationAdvance({
        ...skip,
        revision: current.revision,
        recruiterSkipTarget: current.recruiterSkipTarget,
      });
      assert.equal(result.recruiterDismissal, 'skipped');
      assert.equal(result.recruiterSkipTarget, undefined);
      assert.equal(result.recruiterChat, undefined);
      assert.equal(result.delivery, 'provider-confirmed');
      assert.equal(skips, 1);
      assert.equal(fixture.state.submitted, 0);
      await api.vacancyApplicationClose({
        ...applicationInput,
        revision: result.revision,
      });
      const recovered = await api.vacancyApplicationStatus(applicationInput);
      assert.equal(recovered.active, false);
      assert.equal(recovered.recruiterDismissal, 'skipped');
    });
  });

  for (const reason of ['completed', 'quiet']) {
    test(`a ${reason} recruiter panel dismissal survives ${type} recovery`, async (t) => {
      const fixture = applicationFixture({
        application: {
          readRecruiterPanel: async (_browser, _vacancy, { dismissal }) => {
            dismissal.check();
            assert.equal(Boolean(dismissal.defer), false);
            fixture.state.page.recruiterPanelOpen = false;
            return { matched: false, dismissed: reason };
          },
        },
      });
      t.after(() => fixture.close());
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const opened = await api.vacancyApplicationOpen(applicationInput);
        assert.throws(() =>
          applicationResult(
            { ...opened, recruiterDismissal: reason },
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
        assert.equal(receipt.recruiterDismissal, reason);
        await api.vacancyApplicationClose({
          ...applicationInput,
          revision: receipt.revision,
        });
        const saved = await api.vacancyApplicationStatus(applicationInput);
        assert.equal(saved.active, false);
        assert.equal(saved.recruiterDismissal, reason);
      });
    });
  }

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
