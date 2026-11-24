import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationResult } from '../src/jobs/application-result.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
const input = (receipt, extra = {}) => ({
  ...applicationInput,
  revision: receipt.revision,
  ...extra,
});
const refused = (code) => (error) => error.code === `jobs-application-${code}`;

test(
  'native entry reads the complete vacancy, keeps a headed slot and fills only exact native-form fields',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const { service, state } = fixture;
    try {
      const review = await fixture.enter();
      assert.equal(review.state, 'review');
      assert.equal(review.exact, false);
      assert.equal(state.calls[0][1].headless, undefined);
      assert.equal(state.calls[0][1].slot, 'jobs');
      const options = state.calls.find(([kind]) => kind === 'plan')[1];
      assert(
        options.vacancy.description.endsWith(
          'Employer’s final paragraph stays intact.'
        )
      );
      assert.equal(options.approximate, false);
      assert.equal(options.modelDraft, false);
      const filled = await service['application-prefill'](
        input(review, { confirm: true })
      );
      assert.equal(filled.exact, true);
      assert.deepEqual(state.writes, ['frame-1:Recent experience']);
      assert.equal(state.submitted, 0);
      const delivered = await service['application-advance'](
        input(filled, { action: 'submit', confirm: true })
      );
      assert.equal(delivered.state, 'delivered');
      assert.equal(delivered.delivery, 'provider-confirmed');
      assert.equal(state.entered, 1);
      assert.equal(state.submitted, 1);
      applicationResult(delivered, applicationInput);
      await assert.rejects(
        service['application-advance'](
          input(delivered, { action: 'submit', confirm: true })
        ),
        refused('already-attempted')
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'test mode makes zero entry, letter, answer or submission effects',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    try {
      const opened = await fixture.service['application-open']({
        ...applicationInput,
        testMode: true,
      });
      const result = await fixture.service['application-advance'](
        input(opened, { action: 'enter', confirm: true })
      );
      assert.equal(result.state, 'test-preview');
      const filled = await fixture.service['application-prefill'](
        input(opened, { confirm: true })
      );
      assert.equal(filled.state, 'test-preview');
      assert.equal(fixture.state.entered, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.deepEqual(fixture.state.writes, []);
      assert.deepEqual(
        (await fixture.store.query()).filter(
          (row) => !row.id.startsWith('secret:jobs-application:')
        ),
        []
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'paused questionnaires remain live and can resume; worker modes reset on restart',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    let recovered;
    try {
      const review = await fixture.enter();
      const deferred = await fixture.service['application-mode'](
        input(review, { noQuestionnaires: true, paused: true })
      );
      assert.equal(deferred.state, 'paused');
      await assert.rejects(
        fixture.service['application-prefill'](
          input(deferred, { confirm: true })
        ),
        refused('state')
      );
      const paused = await fixture.service['application-mode'](
        input(deferred, { paused: true, noQuestionnaires: false })
      );
      assert.equal(paused.state, 'paused');
      const resumed = await fixture.service['application-mode'](
        input(paused, { paused: false })
      );
      assert.equal(resumed.state, 'review');
      const row = (await fixture.store.query())[0];
      assert.equal(Object.hasOwn(row, 'noQuestionnaires'), false);
      assert.equal(Object.hasOwn(row, 'paused'), false);
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      const restart = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.equal(restart.noQuestionnaires, false);
      assert.equal(restart.paused, false);
      assert.equal(restart.state, 'review');
      assert.equal(fixture.state.entered, 1);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

for (const mode of ['challenge', 'dailyLimit', 'external']) {
  test(
    `native ${mode} pauses without provider effects and preserves delivery uncertainty`,
    { timeout: 3000 },
    async () => {
      const fixture = applicationFixture();
      try {
        fixture.state.page[mode] = true;
        const result =
          await fixture.service['application-open'](applicationInput);
        assert.equal(
          result.state,
          {
            challenge: 'verification',
            dailyLimit: 'daily-limit',
            external: 'external',
          }[mode]
        );
        await assert.rejects(
          fixture.service['application-advance'](
            input(result, { action: 'enter', confirm: true })
          ),
          refused('state')
        );
        assert.equal(fixture.state.entered, 0);
        fixture.state.page[mode] = false;
        const current = await fixture.service['application-read'](
          input(result)
        );
        assert.equal(current.state, 'ready');
        assert(current.vacancy.description);
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'changed pages, stale revisions and conflicting request settings cannot dispatch',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    const { service, state } = fixture;
    try {
      const opened = await service['application-open'](applicationInput);
      await assert.rejects(
        service['application-open']({
          ...applicationInput,
          coverLetter: 'Different intent',
        }),
        refused('conflict')
      );
      await assert.rejects(
        service['application-advance'](
          input(opened, { revision: 'stale', action: 'enter', confirm: true })
        ),
        refused('changed')
      );
      state.page.documentKey = 'replacement';
      await assert.rejects(
        service['application-advance'](
          input(opened, { action: 'enter', confirm: true })
        ),
        refused('changed')
      );
      assert.equal(state.entered, 0);
      assert.equal(
        (await service['application-status'](applicationInput)).attempted.enter,
        false
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'native dispatch is journaled before issue; an uncertain exception never replays on restart or a new request',
  { timeout: 3000 },
  async () => {
    let recovered;
    const fixture = applicationFixture({
      application: {
        dispatch: async () => {
          const [row] = await fixture.store.query();
          assert.equal(row.attempted.enter, true);
          assert.equal(row.delivery, 'unknown');
          fixture.state.entered++;
          throw Object.assign(new Error('Lost dispatch response'), {
            code: 'fixture-lost',
          });
        },
      },
    });
    try {
      const opened =
        await fixture.service['application-open'](applicationInput);
      await assert.rejects(
        fixture.service['application-advance'](
          input(opened, { action: 'enter', confirm: true })
        ),
        { code: 'fixture-lost' }
      );
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      const status = await recovered['application-status'](applicationInput);
      assert.equal(status.state, 'interrupted');
      assert.equal(status.delivery, 'unknown');
      const repeated = await recovered['application-open'](applicationInput);
      assert.equal(repeated.delivery, 'unknown');
      assert.equal(fixture.state.opened, 1);
      await assert.rejects(
        recovered['application-open']({
          ...applicationInput,
          requestId: 'new-intent',
        }),
        refused('conflict')
      );
      const live = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      await assert.rejects(
        recovered['application-advance'](
          input(live, { action: 'enter', confirm: true })
        ),
        refused('already-attempted')
      );
      assert.equal(fixture.state.entered, 1);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

test(
  'a definitive native refusal releases only its unissued reservation',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture({
      application: { dispatch: async () => ({ dispatched: false }) },
    });
    try {
      const opened =
        await fixture.service['application-open'](applicationInput);
      const result = await fixture.service['application-advance'](
        input(opened, { action: 'enter', confirm: true })
      );
      assert.equal(result.attempted.enter, false);
      assert.equal(result.delivery, 'none');
      assert.equal((await fixture.store.query())[0].attempted.enter, false);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a configured cover letter must be retained before submitting',
  { timeout: 3000 },
  async () => {
    const fixture = applicationFixture();
    try {
      const review = await fixture.enter(fixture.service, {
        coverLetter: 'Owner letter',
      });
      await assert.rejects(
        fixture.service['application-advance'](
          input(review, { action: 'submit', confirm: true })
        ),
        refused('letter')
      );
      fixture.state.page.letter = {
        value: 'Owner typed a different letter',
        index: 2,
        disabled: false,
      };
      const current = await fixture.service['application-read'](input(review));
      const result = await fixture.service['application-prefill'](
        input(current, { confirm: true })
      );
      assert.equal(result.letter, 'owner-conflict');
      assert.equal(
        fixture.state.page.letter.value,
        'Owner typed a different letter'
      );
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await fixture.close();
    }
  }
);
