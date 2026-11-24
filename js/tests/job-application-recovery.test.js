import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationRecoveryFixture,
  applicationFormUrl,
} from '../../experiments/issue-56/application-recovery-fixture.mjs';

const identity = (receipt, extra = {}) => ({
  ...applicationInput,
  revision: receipt.revision,
  ...extra,
});

for (const stage of ['put', 'flush']) {
  test(
    `failed form-location ${stage} preserves the acknowledged entry reservation without a recovery URL`,
    { timeout: 3000 },
    async () => {
      const memory = createMemoryStore();
      let armed = true;
      let formWrite = false;
      const refuse = () => {
        if (armed && formWrite) {
          armed = false;
          throw Object.assign(new Error('Fixture checkpoint refused'), {
            code: 'fixture-storage',
          });
        }
      };
      const store = {
        ...memory,
        put: async (row) => {
          await memory.put(row);
          formWrite = row.resumeUrl === applicationFormUrl;
          if (stage === 'put') {
            refuse();
          }
        },
        flush: stage === 'flush' ? refuse : undefined,
      };
      const fixture = applicationRecoveryFixture({ store });
      let recovered;
      try {
        await assert.rejects(fixture.enter(), { code: 'fixture-storage' });
        assert.equal(fixture.state.entered, 1);
        const [row] = await memory.query();
        assert.equal(row.resumeUrl, null);
        assert.equal(row.attempted.enter, true);
        assert.equal(row.delivery, 'unknown');
        await fixture.service.stop();
        recovered = createVacancyService(fixture.serviceOptions);
        const receipt = await recovered['application-open']({
          ...applicationInput,
          recover: true,
        });
        assert.equal(receipt.state, 'ready');
        assert.equal(receipt.delivery, 'unknown');
        assert.equal(receipt.attempted.enter, true);
        await assert.rejects(
          recovered['application-advance'](
            identity(receipt, { action: 'enter', confirm: true })
          ),
          { code: 'jobs-application-already-attempted' }
        );
        assert.equal(fixture.state.entered, 1);
        assert.equal(fixture.state.submitted, 0);
      } finally {
        await recovered?.stop();
        await fixture.close();
      }
    }
  );
}

test(
  'full-form recovery reopens the acknowledged questionnaire without replaying native entry',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRecoveryFixture();
    let recovered;
    try {
      const review = await fixture.enter();
      assert.equal(review.state, 'review');
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      let receipt = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.equal(receipt.state, 'review');
      assert.equal(receipt.page.url, applicationFormUrl);
      assert.equal(
        fixture.state.calls.findLast(([name]) => name === 'goto')[1],
        applicationFormUrl
      );
      assert.equal(receipt.attempted.enter, true);
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 0);
      await assert.rejects(
        recovered['application-advance'](
          identity(receipt, { action: 'enter', confirm: true })
        ),
        { code: 'jobs-application-already-attempted' }
      );
      receipt = await recovered['application-prefill'](
        identity(receipt, { confirm: true })
      );
      receipt = await recovered['application-advance'](
        identity(receipt, { action: 'submit', confirm: true })
      );
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 1);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

test(
  'foreign or malformed saved form URLs cannot launch a recovery browser',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRecoveryFixture();
    try {
      await fixture.enter();
      await fixture.service.stop();
      const original = (await fixture.store.query())[0];
      const invalid = [
        'https://hh.ru.attacker.test/applicant/vacancy_response?vacancyId=123',
        'https://owner@hh.ru/applicant/vacancy_response?vacancyId=123',
        'https://hh.ru/applicant/vacancy_response?vacancyId=456',
        'https://hh.ru/applicant/vacancy_response?vacancyId=123&vacancyId=123',
        'http://hh.ru/applicant/vacancy_response?vacancyId=123',
        'https://hh.ru/account/delete?vacancyId=123',
        {},
      ];
      for (const resumeUrl of invalid) {
        await fixture.store.put({ ...original, resumeUrl });
        const service = createVacancyService(fixture.serviceOptions);
        try {
          await assert.rejects(
            service['application-open']({
              ...applicationInput,
              recover: true,
            }),
            { code: 'jobs-application-journal' }
          );
        } finally {
          await service.stop();
        }
        assert.equal(fixture.state.opened, 1);
      }
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a recovered native form retains an uncertain submit reservation without replay',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRecoveryFixture();
    const dispatch = fixture.serviceOptions.application.dispatch;
    fixture.serviceOptions.application.dispatch = async (...args) => {
      if (args[2] === 'submit') {
        fixture.state.submitted++;
        throw new Error('Unreceived provider response');
      }
      return dispatch(...args);
    };
    fixture.service = createVacancyService(fixture.serviceOptions);
    let recovered;
    try {
      const review = await fixture.enter();
      await assert.rejects(
        fixture.service['application-advance'](
          identity(review, { action: 'submit', confirm: true })
        )
      );
      await fixture.service.stop();
      recovered = createVacancyService(fixture.serviceOptions);
      const receipt = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.equal(receipt.state, 'review');
      assert.equal(receipt.delivery, 'unknown');
      assert.equal(receipt.attempted.enter, true);
      assert.equal(receipt.attempted.submit, true);
      await assert.rejects(
        recovered['application-advance'](
          identity(receipt, { action: 'submit', confirm: true })
        ),
        { code: 'jobs-application-already-attempted' }
      );
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 1);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);

test(
  'legacy journals remain readable without inventing a recovered questionnaire',
  { timeout: 3000 },
  async () => {
    const fixture = applicationRecoveryFixture();
    let recovered;
    try {
      await fixture.enter();
      await fixture.service.stop();
      const row = (await fixture.store.query())[0];
      delete row.resumeUrl;
      await fixture.store.put(row);
      recovered = createVacancyService(fixture.serviceOptions);
      const status = await recovered['application-status'](applicationInput);
      assert.equal(status.state, 'interrupted');
      assert.equal(status.active, false);
      const receipt = await recovered['application-open']({
        ...applicationInput,
        recover: true,
      });
      assert.equal(receipt.state, 'ready');
      assert.equal(receipt.attempted.enter, true);
      await assert.rejects(
        recovered['application-advance'](
          identity(receipt, { action: 'enter', confirm: true })
        ),
        { code: 'jobs-application-already-attempted' }
      );
      assert.equal(fixture.state.entered, 1);
      assert.equal(fixture.state.submitted, 0);
    } finally {
      await recovered?.stop();
      await fixture.close();
    }
  }
);
