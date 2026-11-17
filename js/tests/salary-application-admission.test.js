import test from 'node:test';
import assert from 'node:assert/strict';
import {
  salaryApplicationFixture,
  refuseApplicationDrafts,
  applicationSalary as salary,
} from '../../experiments/issue-56/application-salary-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationFormUrl } from '../../experiments/issue-56/application-recovery-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationFullFormFixture } from '../../experiments/issue-56/application-fullform-fixture.mjs';
import { applicationBatchFixture } from '../../experiments/issue-56/application-batch-fixture.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationSettings } from '../src/jobs/application-options.js';
import { applicationSalaryDecision } from '../src/jobs/application-salary.js';
import { vacancySnapshot } from '../src/assignments/vacancy.js';
import { createVacancyService } from '../src/jobs/service.js';

const limits = { timeout: 6000 };
const open = (f, extra = {}) =>
  f.service['application-open']({ ...applicationInput, salary, ...extra });
const advance = (f, receipt, action = 'enter') =>
  f.service['application-advance'](
    identity(receipt, { action, confirm: true })
  );

test(
  'low maxima and current-tier deferrals block native entry without reserving or dispatching',
  limits,
  async (t) => {
    for (const [text, action] of [
      ['до 200000 ₽', 'exclude'],
      ['от 400000 ₽', 'defer'],
    ]) {
      const f = await salaryApplicationFixture(t, text);
      const receipt = await open(f);
      assert.equal(receipt.salaryAdmission.action, action);
      await assert.rejects(advance(f, receipt), {
        code: `jobs-application-salary-${action}`,
      });
      const status = await f.service['application-status'](applicationInput);
      assert.deepEqual(status.attempted, { enter: false, submit: false });
      assert.equal(status.delivery, 'none');
      assert.equal(f.state.entered, 0);
      assert.equal(f.state.submitted, 0);
      assert.deepEqual(f.state.writes, []);
    }
  }
);

test(
  'a full-form navigation checks salary before opening a questionnaire',
  limits,
  async (t) => {
    const f = await applicationFullFormFixture(t, { input: { salary } });
    assert.equal(f.opened.salaryAdmission.action, 'defer');
    await assert.rejects(f.form(), { code: 'jobs-application-salary-defer' });
    assert.equal(f.state.navigated ?? 0, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'unknown pay, a released floor and explicit opt-out preserve eligible native actions',
  limits,
  async (t) => {
    for (const [text, extra] of [
      ['', {}],
      ['от 400000 ₽', { salaryFloorRub: 400000 }],
      ['до 200000 ₽', { salaryLadder: false }],
    ]) {
      const f = await salaryApplicationFixture(t, text);
      let receipt = await open(f, extra);
      assert(
        receipt.salaryAdmission === null ||
          receipt.salaryAdmission.action === 'apply'
      );
      receipt = await advance(f, receipt);
      assert.equal(receipt.state, 'review');
      assert.equal(f.state.entered, 1);
      assert.equal(f.state.submitted, 0);
    }
  }
);

test(
  'missing direct-form context saves actual answers before visiting the vacancy and restores them without sending',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    let savedBeforeNavigation = false;
    f.onGoto = async (url) => {
      if (url === applicationInput.url) {
        const saved = await f.store.get('secret:jobs-application:jobs:123');
        const qa = await f.store.get(
          'secret:jobs-application-answers:jobs:123'
        );
        assert.deepEqual(
          saved.draft.fields.map((field) => field.value),
          ['Actual owner experience', 'Actual owner letter']
        );
        assert.equal(qa.draftId, saved.draft.id);
        savedBeforeNavigation = true;
      }
    };
    const receipt = await open(f, { formUrl: applicationFormUrl });
    assert(savedBeforeNavigation);
    assert.deepEqual(f.state.contextVisits, [
      applicationFormUrl,
      applicationInput.url,
      applicationFormUrl,
    ]);
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(receipt.salaryAdmission.action, 'exclude');
    assert.deepEqual(
      f.state.fields.slice(1).map((field) => field.value),
      ['Actual owner experience', 'Actual owner letter']
    );
    await assert.rejects(advance(f, receipt, 'submit'), {
      code: 'jobs-application-salary-exclude',
    });
    const cached = await vacancySnapshot(
      f.store,
      () => assert.fail('must use full cache'),
      applicationInput.url,
      false
    );
    assert.equal(cached.salary, 'до 200000 ₽');
    assert(cached.description);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a refused direct-form backup retains the owned form without navigating or sending',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    refuseApplicationDrafts(f.store);
    await assert.rejects(open(f, { formUrl: applicationFormUrl }), {
      code: 'fixture-backup',
    });
    assert.deepEqual(f.state.contextVisits, [applicationFormUrl]);
    assert.equal(f.state.closed, 0);
    assert.equal(f.state.fields[1].value, 'Actual owner experience');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a missing full vacancy returns to the preserved form and holds sending',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    f.onVacancy = () => {
      throw Object.assign(new Error('Vacancy unavailable'), {
        code: 'fixture-vacancy',
      });
    };
    await assert.rejects(open(f, { formUrl: applicationFormUrl }), {
      code: 'fixture-vacancy',
    });
    assert.equal(f.state.page.url, applicationFormUrl);
    assert.equal(f.state.closed, 0);
    const status = await f.service['application-status'](applicationInput);
    assert.equal(status.salaryAdmission.action, 'hold');
    assert.equal(status.draft.fields[0].value, 'Actual owner experience');
    assert.equal(f.state.fields[1].value, 'Actual owner experience');
    assert.equal(f.state.fields[2].value, 'Actual owner letter');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'batch salary deferrals revisit at the lower tier without becoming permanent exclusions',
  limits,
  async (t) => {
    const f = applicationBatchFixture(t, {
      vacancy: () => ({ ...vacancySnapshotFixture(), salary: 'от 400000 ₽' }),
    });
    await f.start({ salary });
    const result = await f.until(
      (receipt) => receipt.batch.phase === 'completed'
    );
    assert.equal(result.batch.skipped, 0);
    assert.equal(result.batch.salaryTier, 1);
    assert.equal(result.batch.salaryFloorRub, 400000);
    assert.equal(result.batch.delivered, 2);
    assert.equal(f.state.submitted, 2);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.opened, f.state.closed);
    assert.deepEqual(
      (await f.service['application-queue'](applicationInput)).entries,
      []
    );
    assert.deepEqual((await f.service['choices-stored']({})).entries, []);
  }
);

test(
  'frozen salary decisions, direct-form identity and bounded floor controls reject forged inputs',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    const receipt = await open(f);
    assert.throws(() =>
      applicationResult(
        {
          ...receipt,
          salaryAdmission: {
            action: 'apply',
            reason: 'eligible-pay',
            floorRub: 450000,
          },
        },
        applicationInput
      )
    );
    for (const extra of [
      { salaryLadder: 'false' },
      { salaryFloorRub: null },
      { salaryFloorRub: -1 },
      { salaryFloorRub: Infinity },
      { formUrl: 'https://hh.ru/applicant/vacancy_response?vacancyId=456' },
      {
        formUrl: 'https://example.com/applicant/vacancy_response?vacancyId=123',
      },
    ]) {
      assert.throws(() =>
        applicationSettings({ ...applicationInput, ...extra })
      );
    }
    assert.equal(
      applicationSalaryDecision({ salary }, { salary: 'до 225000 ₽' }).action,
      'defer'
    );
    assert.equal(
      applicationSalaryDecision({ salary }, { salary: 'up to $2999' }).action,
      'exclude'
    );
  }
);

test(
  'a reopened ready review rereads full salary and keeps the original targets',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t, 'от 600000 ₽');
    const first = await open(f);
    assert.equal(first.salaryAdmission.action, 'apply');
    await f.service.stop();
    f.state.salaryText = 'до 200000 ₽';
    f.service = createVacancyService(f.serviceOptions);
    const second = await f.service['application-open']({
      ...applicationInput,
      recover: true,
    });
    assert.equal(second.salary.currencies[0].net, 450000);
    assert.equal(second.salaryAdmission.action, 'exclude');
    await assert.rejects(advance(f, second), {
      code: 'jobs-application-salary-exclude',
    });
    assert.equal(f.state.entered, 0);
  }
);

test(
  'rates that expire while reserving dispatch refuse the effect and release that unsent reservation',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t, 'от 600000 ₽');
    const rated = globalThis.structuredClone(salary);
    rated.exchange = {
      base: 'RUB',
      asOf: new Date(f.state.clock).toISOString().slice(0, 10),
      maxAgeDays: 1,
      source: 'manual',
      rates: [
        { code: 'USD', rate: 80 },
        { code: 'EUR', rate: 90 },
      ],
    };
    const receipt = await open(f, { salary: rated });
    const put = f.store.put.bind(f.store);
    f.store.put = async (row) => {
      const result = await put(row);
      if (row.state === 'sending') {
        f.state.clock += 3 * 86400000;
      }
      return result;
    };
    await assert.rejects(advance(f, receipt), {
      code: 'jobs-application-salary-rates-stale',
    });
    const status = await f.service['application-status'](applicationInput);
    assert.equal(status.delivery, 'none');
    assert.equal(status.attempted.enter, false);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a new full-cache salary blocks form submission and salary deferral preserves actual answers before questionnaire policy closes it',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t, 'от 600000 ₽');
    let receipt = await advance(f, await open(f));
    f.state.fields[1].value = 'Latest actual answer';
    f.state.fields[2].value = 'Latest actual letter';
    await vacancySnapshot(
      f.store,
      async () => ({ ...vacancySnapshotFixture(), salary: 'от 400000 ₽' }),
      applicationInput.url,
      true
    );
    await assert.rejects(advance(f, receipt, 'submit'), {
      code: 'jobs-application-salary-context-changed',
    });
    assert.equal(f.state.submitted, 0);
    receipt = await f.service['application-status'](applicationInput);
    receipt = await f.service['application-read'](identity(receipt));
    assert.equal(receipt.salaryAdmission.action, 'defer');
    receipt = await f.service['application-mode'](
      identity(receipt, { noQuestionnaires: true })
    );
    assert.equal(receipt.state, 'closed');
    assert.equal(f.state.closed, f.state.opened);
    assert.equal(f.state.submitted, 0);
    const saved = await f.store.get('secret:jobs-application:jobs:123');
    const qa = await f.store.get('secret:jobs-application-answers:jobs:123');
    assert.deepEqual(
      saved.draft.fields.map((field) => field.value),
      ['Latest actual answer', 'Latest actual letter']
    );
    assert.equal(qa.draftId, saved.draft.id);
    assert.deepEqual(
      (await f.service['application-queue'](applicationInput)).entries,
      []
    );
    assert.equal(
      (await f.store.query()).filter((row) =>
        row.id.startsWith('jobs-vacancy-choice:')
      ).length,
      0
    );
  }
);

test(
  'a private Q&A acknowledgement failure keeps the salary-held questionnaire and actual values open',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t, 'от 600000 ₽');
    let receipt = await advance(f, await open(f));
    f.state.fields[1].value = 'Keep this actual owner answer';
    await vacancySnapshot(
      f.store,
      async () => ({ ...vacancySnapshotFixture(), salary: 'от 400000 ₽' }),
      applicationInput.url,
      true
    );
    receipt = await f.service['application-read'](identity(receipt));
    const put = f.store.put.bind(f.store);
    f.store.put = async (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        throw Object.assign(new Error('Q&A acknowledgement refused'), {
          code: 'fixture-qa-save',
        });
      }
      return put(row);
    };
    await assert.rejects(
      f.service['application-mode'](
        identity(receipt, { noQuestionnaires: true })
      ),
      { code: 'fixture-qa-save' }
    );
    assert.equal(f.state.closed, 0);
    assert.equal(f.state.fields[1].value, 'Keep this actual owner answer');
    assert.equal(f.state.submitted, 0);
    assert.deepEqual(
      (await f.service['application-queue'](applicationInput)).entries,
      []
    );
  }
);

test(
  'a run-mode change during direct-form backup refuses navigation and retains owner values',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    const put = f.store.put.bind(f.store);
    let signalled = false;
    f.store.put = async (row) => {
      const result = await put(row);
      if (row.draft && !signalled) {
        signalled = true;
        f.service['application-signal-mode']({
          ...applicationInput,
          noQuestionnaires: true,
        });
      }
      return result;
    };
    await assert.rejects(open(f, { formUrl: applicationFormUrl }), {
      code: 'jobs-application-mode-changed',
    });
    assert.deepEqual(f.state.contextVisits, [applicationFormUrl]);
    assert.equal(f.state.closed, 0);
    assert.equal(f.state.fields[1].value, 'Actual owner experience');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a mode change while reading direct-form context stops return navigation and keeps the private draft',
  limits,
  async (t) => {
    const f = await salaryApplicationFixture(t);
    f.onVacancy = async () => {
      f.service['application-signal-mode']({
        ...applicationInput,
        noQuestionnaires: true,
      });
    };
    await assert.rejects(open(f, { formUrl: applicationFormUrl }), {
      code: 'jobs-application-mode-changed',
    });
    assert.deepEqual(f.state.contextVisits, [
      applicationFormUrl,
      applicationInput.url,
    ]);
    const saved = await f.store.get('secret:jobs-application:jobs:123');
    assert.deepEqual(
      saved.draft.fields.map((field) => field.value),
      ['Actual owner experience', 'Actual owner letter']
    );
    assert.equal(f.state.submitted, 0);
  }
);
