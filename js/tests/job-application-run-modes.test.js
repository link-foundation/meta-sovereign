import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationModeSignals } from '../src/cli/application-signals.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationRunFixture,
  applicationIdentity as identity,
} from '../../experiments/issue-56/application-run-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const mode = (fixture, receipt, options) =>
  fixture.service['application-mode'](identity(receipt, options));
const close = (fixture, receipt) =>
  fixture.service['application-close'](identity(receipt));
const open = (fixture, number, slot = 'jobs') =>
  fixture.service['application-open']({
    url: `https://hh.ru/vacancy/${number}`,
    browserSlot: slot,
    requestId: `run-${number}`,
  });
const assertPrivate = async (fixture) => {
  for (const row of await fixture.store.query()) {
    assert(
      row.id.startsWith('secret:jobs-application') ||
        row.id.startsWith('qa-rule:')
    );
    for (const key of ['noQuestionnaires', 'paused', 'slots']) {
      assert.equal(Object.hasOwn(row, key), false);
      assert.equal(Object.hasOwn(row.options ?? {}, key), false);
    }
  }
};

test(
  'run policies survive closing and changing vacancies, isolate slots and reset on worker restart',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRunFixture();
    let recovered;
    try {
      let receipt = await open(fixture, 123);
      receipt = await mode(fixture, receipt, {
        noQuestionnaires: true,
        paused: true,
      });
      assert.equal(receipt.state, 'paused');
      await close(fixture, receipt);
      receipt = await open(fixture, 456);
      assert.equal(
        receipt.noQuestionnaires,
        true,
        'new vacancy inherits the worker policy'
      );
      assert.equal(receipt.paused, true);
      assert.equal(receipt.state, 'paused');
      await close(fixture, receipt);
      const saved = await fixture.service['application-status'](
        identity(receipt)
      );
      assert.equal(saved.noQuestionnaires, true);
      assert.equal(saved.paused, true);
      receipt = await open(fixture, 789, 'other-account');
      assert.equal(receipt.noQuestionnaires, false);
      assert.equal(receipt.paused, false);
      assert.equal(receipt.state, 'ready');
      await close(fixture, receipt);
      receipt = await open(fixture, 321);
      receipt = await mode(fixture, receipt, { noQuestionnaires: false });
      assert.equal(
        receipt.paused,
        true,
        'changing questionnaires preserves pause'
      );
      receipt = await mode(fixture, receipt, { paused: false });
      assert.equal(receipt.state, 'ready');
      receipt = await mode(fixture, receipt, {
        noQuestionnaires: true,
        paused: true,
      });
      await assertPrivate(fixture);
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      receipt = await recovered['application-open']({
        ...identity(receipt),
        recover: true,
      });
      assert.equal(receipt.noQuestionnaires, false);
      assert.equal(receipt.paused, false);
      assert.equal(receipt.state, 'ready');
      assert.equal(fixture.state.submitted, 0);
      assert.deepEqual(fixture.state.writes, []);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

test(
  'no-questionnaire policy holds even exact answers but permits a letter-only application',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    try {
      let receipt = await fixture.enter();
      fixture.state.fields[1].value = 'Reviewed answer';
      receipt = await mode(fixture, receipt, { noQuestionnaires: true });
      assert.equal(receipt.exact, true);
      assert.equal(receipt.state, 'closed');
      assert.equal(receipt.active, false);
      await assert.rejects(
        fixture.service['application-prefill'](
          identity(receipt, { confirm: true })
        ),
        { code: 'jobs-application-missing' }
      );
      fixture.state.page.questions = false;
      fixture.state.page.letter = {
        index: 1,
        value: 'Reviewed answer',
        disabled: false,
      };
      receipt = await fixture.service['application-open']({
        ...identity(receipt),
        recover: true,
      });
      assert.equal(receipt.noQuestionnaires, true);
      assert.equal(receipt.state, 'review');
      receipt = await fixture.service['application-advance'](
        identity(receipt, { action: 'submit', confirm: true })
      );
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(fixture.state.submitted, 1);
      assert.deepEqual(fixture.state.writes, []);
      await assertPrivate(fixture);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a rejected mode acknowledgement cannot change the next vacancy policy',
  { timeout: 3000 },
  async () => {
    const store = createMemoryStore();
    let refuse = false;
    store.flush = async () => {
      if (refuse) {
        refuse = false;
        throw new Error('refused flush');
      }
    };
    const fixture = applicationRunFixture({ store });
    try {
      let receipt = await open(fixture, 123);
      refuse = true;
      await assert.rejects(
        mode(fixture, receipt, { paused: true, noQuestionnaires: true }),
        /refused flush/u
      );
      receipt = await fixture.service['application-status'](identity(receipt));
      assert.equal(receipt.paused, false);
      assert.equal(receipt.noQuestionnaires, false);
      assert.equal(receipt.state, 'ready');
      await close(fixture, receipt);
      receipt = await open(fixture, 456);
      assert.equal(receipt.paused, false);
      assert.equal(receipt.noQuestionnaires, false);
      await assertPrivate(fixture);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a worker signal interrupts exact-answer delay without waiting behind the active operation',
  { timeout: 3000 },
  async () => {
    let interruptions = 0;
    const fixture = applicationFixture({
      application: {
        trace: (event) => {
          if (event.event === 'application-review-delay') {
            interruptions++;
            fixture.service['application-signal-mode']({
              ...applicationInput,
              noQuestionnaires: true,
            });
          }
        },
      },
    });
    try {
      let receipt = await fixture.enter(fixture.service, {
        autoExact: true,
        reviewDelayMs: 0,
      });
      receipt = await fixture.service['application-prefill'](
        identity(receipt, { confirm: true })
      );
      assert.equal(interruptions, 1);
      assert.equal(receipt.state, 'closed');
      assert.equal(receipt.noQuestionnaires, true);
      assert.equal(receipt.attempted.submit, false);
      assert.equal(fixture.state.submitted, 0);
      fixture.service['application-signal-mode']({
        ...applicationInput,
        noQuestionnaires: false,
      });
      receipt = await fixture.service['application-open']({
        ...identity(receipt),
        recover: true,
      });
      assert.equal(receipt.state, 'review');
      assert.equal(
        fixture.state.submitted,
        0,
        'enabling questions only resumes review'
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a signal arriving during the last native guard refuses dispatch',
  { timeout: 3000 },
  async () => {
    const held = gate();
    const started = gate();
    let block = false;
    const fixture = applicationFixture({
      application: {
        readPage: async () => {
          if (block) {
            block = false;
            started.resolve();
            await held.promise;
          }
          return globalThis.structuredClone(fixture.state.page);
        },
      },
    });
    let sending;
    try {
      const receipt = await fixture.enter();
      block = true;
      sending = fixture.service['application-advance'](
        identity(receipt, { action: 'submit', confirm: true })
      );
      const rejected = assert.rejects(sending, {
        code: 'jobs-application-state',
      });
      await started.promise;
      fixture.service['application-signal-mode']({
        ...applicationInput,
        noQuestionnaires: true,
      });
      held.resolve();
      await rejected;
      const status = await fixture.service['application-status'](
        identity(receipt)
      );
      assert.equal(status.state, 'interrupted');
      assert.equal(status.active, false);
      assert.equal(
        (await fixture.service['application-queue']({})).entries.length,
        1
      );
      assert.equal(status.attempted.submit, false);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      held.resolve();
      await sending?.catch(() => {});
      await fixture.close();
    }
  }
);

for (const refused of [false, true]) {
  test(
    `a later worker signal survives an overlapping mode acknowledgement (refused: ${refused})`,
    { timeout: 3000 },
    async () => {
      const held = gate();
      const started = gate();
      const store = createMemoryStore();
      let block = false;
      store.flush = async () => {
        if (block) {
          block = false;
          started.resolve();
          await held.promise;
          if (refused) {
            throw new Error('refused flush');
          }
        }
      };
      const fixture = applicationFixture({ store });
      let changing;
      try {
        const receipt = await fixture.enter();
        block = true;
        changing = mode(fixture, receipt, { paused: true });
        const completed = refused
          ? assert.rejects(changing, /refused flush/u)
          : changing;
        await started.promise;
        fixture.service['application-signal-mode']({
          ...applicationInput,
          noQuestionnaires: true,
        });
        held.resolve();
        await completed;
        const status = await fixture.service['application-status'](
          identity(receipt)
        );
        assert.equal(status.paused, false);
        assert.equal(status.noQuestionnaires, true);
        assert.equal(status.state, refused ? 'deferred' : 'interrupted');
        assert.equal(status.active, refused);
        await assertPrivate(fixture);
      } finally {
        held.resolve();
        await changing?.catch(() => {});
        await fixture.close();
      }
    }
  );
}

test(
  'foreground mode signals release their listeners and refuse invalid or stopped policy changes',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const events = new EventEmitter();
    events.platform = 'linux';
    const logs = [];
    const release = applicationModeSignals(
      fixture.service,
      applicationInput,
      (value) => logs.push(value),
      events
    );
    try {
      const receipt = await fixture.enter();
      events.emit('SIGUSR1');
      assert.equal(
        (await fixture.service['application-status'](identity(receipt))).state,
        'interrupted'
      );
      events.emit('SIGUSR2');
      assert.equal(
        (await fixture.service['application-status'](identity(receipt))).state,
        'interrupted'
      );
      const resumed = await fixture.service['application-open']({
        ...identity(receipt),
        recover: true,
      });
      assert.equal(resumed.state, 'review');
      assert.equal(resumed.noQuestionnaires, false);
      assert.equal(fixture.state.submitted, 0);
      assert.equal(logs.length, 2);
      assert.throws(
        () =>
          fixture.service['application-signal-mode']({
            ...applicationInput,
            noQuestionnaires: 'true',
          }),
        { code: 'jobs-application-input' }
      );
      release();
      release();
      assert.equal(events.listenerCount('SIGUSR1'), 0);
      assert.equal(events.listenerCount('SIGUSR2'), 0);
      events.platform = 'win32';
      applicationModeSignals(
        fixture.service,
        applicationInput,
        () => assert.fail(),
        events
      )();
      assert.equal(events.listenerCount('SIGUSR1'), 0);
      await fixture.service.stop();
      assert.throws(
        () =>
          fixture.service['application-signal-mode']({
            ...applicationInput,
            noQuestionnaires: true,
          }),
        { code: 'jobs-application-stopped' }
      );
      assert.equal(fixture.state.submitted, 0);
    } finally {
      release();
      await fixture.close();
    }
  }
);
