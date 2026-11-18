import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import {
  vacancySnapshot,
  resolveAssignmentVacancy,
} from '../src/assignments/vacancy.js';
import {
  applicationSettings,
  applicationKey,
} from '../src/jobs/application-options.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  saveApplicationJournal,
  readApplicationJournal,
} from '../src/jobs/application-journal.js';
import { createBrowserAnswerPlanning } from '../src/automation/question-browser-vacancy.js';
import { previewAnswer } from '../src/automation/question-store.js';
import { browserTarget } from '../../experiments/issue-56/question-browser-fixture.mjs';
import { clarificationSalary as salary } from '../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  salaryVacancySnapshot,
  salaryVacancyQuestionSnapshot,
  salaryVacancyQuestion,
  salaryVacancyAnswer,
} from '../../experiments/issue-56/salary-vacancy-fixture.mjs';

const options = { timeout: 5000 };
const input = { ...applicationInput, collectVacancies: false };
const journal = async (f) =>
  (await f.store.query()).find((row) =>
    row.id.startsWith('secret:jobs-application:')
  );

test(
  'disabled collection keeps full live context without a durable description',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const receipt = await f.service['application-open'](input);
    assert.equal(receipt.collectVacancies, false);
    assert.equal(
      receipt.vacancy.description,
      vacancySnapshotFixture().description
    );
    const row = await journal(f);
    assert.equal(row.options.collectVacancies, false);
    assert.equal(row.vacancy, null);
    assert.equal(
      JSON.stringify(await f.store.query()).includes(
        receipt.vacancy.description
      ),
      false
    );
    const context = await vacancySnapshot(
      f.store,
      () => {
        assert.fail(
          'current-run context must avoid a second browser and cache write'
        );
      },
      input.url,
      false
    );
    assert.equal(context.description, receipt.vacancy.description);
    assert.equal(f.state.opened, 1);
    assert.equal(f.state.submitted, 0);
    assert.deepEqual(f.state.writes, []);
  }
);

test(
  'disabled collection does not replace a saved description and vanishes after service shutdown',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const saved = await vacancySnapshot(
      f.store,
      async () => ({
        ...vacancySnapshotFixture(),
        title: 'Earlier owner collection',
      }),
      input.url,
      true
    );
    const opened = await f.service['application-open'](input);
    const current = await vacancySnapshot(
      f.store,
      () => assert.fail('use RAM'),
      input.url,
      false
    );
    assert.equal(current.title, opened.vacancy.title);
    assert.deepEqual(await f.store.get(saved.id), saved);
    await f.service.stop();
    f.service = createVacancyService(f.serviceOptions);
    const offline = await f.service['application-status'](input);
    assert.equal(offline.active, false);
    assert.equal(offline.collectVacancies, false);
    assert.equal(offline.vacancy, null);
    assert.equal(f.state.opened, 1);
    const recovered = await vacancySnapshot(
      f.store,
      () => assert.fail('use acknowledged disk cache'),
      input.url,
      false
    );
    assert.deepEqual(recovered, saved);
  }
);

test(
  'native application planning and confirmed delivery retain RAM context without changing an old cache',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const before = await vacancySnapshot(
      f.store,
      async () => ({
        ...vacancySnapshotFixture(),
        title: 'Previous saved vacancy',
      }),
      input.url,
      true
    );
    const review = await f.enter(f.service, { collectVacancies: false });
    assert.equal(review.state, 'review');
    assert.equal(
      f.state.calls.find(([kind]) => kind === 'plan')[1].vacancy.description,
      vacancySnapshotFixture().description
    );
    const delivered = await f.service['application-advance']({
      ...input,
      revision: review.revision,
      action: 'submit',
      confirm: true,
    });
    assert.equal(delivered.delivery, 'provider-confirmed');
    assert.equal(f.state.submitted, 1);
    assert.deepEqual(await f.store.get(before.id), before);
    assert.equal((await journal(f)).vacancy, null);
    const assignment = await resolveAssignmentVacancy(
      {
        store: f.store,
        readVacancy: () => assert.fail('reuse this run'),
      },
      { vacancyUrl: input.url },
      {}
    );
    assert.equal(assignment.vacancy.title, delivered.vacancy.title);
    assert.deepEqual(await f.store.get(before.id), before);
  }
);

test(
  'a refused journal save rolls back intent while retaining its acknowledged RAM context',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const opened = await f.service['application-open'](input);
    const row = await journal(f);
    const record = { ...row, vacancy: opened.vacancy };
    await saveApplicationJournal(f.store, record);
    const previous = globalThis.structuredClone(record.acknowledged);
    const put = f.store.put.bind(f.store);
    let reject = true;
    f.store.put = async (value) => {
      await put(value);
      if (reject) {
        reject = false;
        throw new Error('Synthetic journal acknowledgement refusal');
      }
    };
    record.vacancy = {
      ...record.vacancy,
      description: 'Unacknowledged changed context',
    };
    record.state = 'sending';
    await assert.rejects(
      saveApplicationJournal(f.store, record),
      /acknowledgement refusal/u
    );
    assert.deepEqual(record.vacancy, previous.vacancy);
    assert.equal(record.state, previous.state);
    assert.equal(record.guard, null);
    assert.equal((await journal(f)).vacancy, null);
    await saveApplicationJournal(f.store, record);
    assert.equal((await journal(f)).vacancy, null);
    const invalid = { ...(await journal(f)), vacancy: opened.vacancy };
    assert.throws(
      () => readApplicationJournal(invalid, applicationKey(input)),
      { code: 'jobs-application-journal' }
    );
  }
);

test(
  'RAM context remains isolated from another workspace and rejects malformed native refreshes',
  options,
  async (t) => {
    let raw = vacancySnapshotFixture();
    const f = applicationFixture({ vacancy: () => raw });
    const other = applicationFixture();
    t.after(async () => {
      await f.close();
      await other.close();
    });
    const opened = await f.service['application-open'](input);
    raw = { ...raw, description: null };
    await assert.rejects(
      f.service['application-read']({ ...input, revision: opened.revision })
    );
    const context = await vacancySnapshot(
      f.store,
      () => assert.fail('keep prior valid context'),
      input.url,
      false
    );
    assert.equal(context.description, opened.vacancy.description);
    let reads = 0;
    const different = await vacancySnapshot(
      other.store,
      async () => {
        reads++;
        return { ...vacancySnapshotFixture(), title: 'Another workspace' };
      },
      input.url,
      false
    );
    assert.equal(reads, 1);
    assert.equal(different.title, 'Another workspace');
  }
);

test(
  'chat salary planning reuses this run without collecting or opening another browser',
  options,
  async (t) => {
    const f = applicationFixture({ vacancy: () => salaryVacancySnapshot() });
    t.after(() => f.close());
    await f.service['application-open'](input);
    const planning = await createBrowserAnswerPlanning({
      store: f.store,
      readVacancy: () => assert.fail('reuse full RAM context'),
    })({ salary }, salaryVacancyQuestionSnapshot(), browserTarget);
    const answer = await previewAnswer(f.store, {
      ...planning,
      source: 'hh',
      chat: salaryVacancyQuestionSnapshot().chat,
      question: salaryVacancyQuestion,
      salary,
    });
    assert.equal(answer.text, salaryVacancyAnswer);
    assert.equal(answer.contexts[0].source, 'vacancy-pay');
    assert.equal(f.state.opened, 1);
    assert.equal(f.state.submitted, 0);
    assert.equal((await journal(f)).vacancy, null);
    assert.equal(
      (await f.store.query()).some((row) =>
        row.id.startsWith('assignment-vacancy:')
      ),
      false
    );
  }
);

test(
  'unreadable salary retains honest RAM context and never falls through to a persistent read',
  options,
  async (t) => {
    const f = applicationFixture({
      vacancy: () => ({ ...vacancySnapshotFixture(), salary: null }),
    });
    t.after(() => f.close());
    const opened = await f.service['application-open'](input);
    assert.equal(opened.vacancy.salary, null);
    const current = await vacancySnapshot(
      f.store,
      () => assert.fail('unknown pay must not cause collection'),
      input.url,
      false
    );
    assert.equal(current.salary, null);
    assert.equal(current.description, opened.vacancy.description);
    assert.equal((await journal(f)).vacancy, null);
    assert.equal(
      (await f.store.query()).some((row) =>
        row.id.startsWith('assignment-vacancy:')
      ),
      false
    );
  }
);

test(
  'a separate explicit collection replaces older RAM context only after acknowledgement',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    await f.service['application-open'](input);
    const saved = await vacancySnapshot(
      f.store,
      async () => ({
        ...vacancySnapshotFixture(),
        title: 'Explicit owner refresh',
      }),
      input.url,
      true
    );
    assert.equal(saved.title, 'Explicit owner refresh');
    const current = await vacancySnapshot(
      f.store,
      () => assert.fail('use acknowledged collection'),
      input.url,
      false
    );
    assert.deepEqual(current, saved);
  }
);

test(
  'collection policy validates before execution and keeps legacy signatures absent',
  options,
  () => {
    const legacy = applicationSettings(applicationInput);
    assert.equal(Object.hasOwn(legacy, 'collectVacancies'), false);
    assert.equal(applicationSettings(input).collectVacancies, false);
    assert.equal(
      applicationSettings({ ...input, collectVacancies: true })
        .collectVacancies,
      true
    );
    for (const value of ['false', 0, null, {}]) {
      assert.throws(
        () => applicationSettings({ ...input, collectVacancies: value }),
        { code: 'jobs-application-input' }
      );
    }
  }
);
