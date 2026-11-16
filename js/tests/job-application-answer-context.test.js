import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationSettings } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';
import { LINO_TEXT, LINO_BINARY, encodeWire } from '../src/transport/lino.js';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationAnswerSalary as salary } from '../../experiments/issue-56/application-answer-context-fixture.mjs';
import { applicationAnswerContextFixture } from './helpers/application-answer-context.mjs';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';

const options = { timeout: 6000 };
const answer = (receipt) => receipt.report.fields[1].answer;
const assertContext = (receipt, profile, email = profile.values.email) => {
  assert.equal(receipt.profileId, profile.id);
  assert.equal(receipt.salary.currencies[0].net, 6200);
  assert.equal(
    receipt.report.planning.profileSource.revision,
    profile.revision
  );
  assert.equal(answer(receipt).source, 'assembled');
  assert.equal(answer(receipt).complete, true);
  assert.equal(answer(receipt).reuseRequiresReview, true);
  for (const part of ['$6 200', '530 000 ₽', email, profile.values.github]) {
    assert(answer(receipt).proposal.value.includes(part), part);
  }
  assert.equal(receipt.exact, false);
  applicationResult(receipt, applicationInput);
};

test(
  'native answer settings are canonical while absent context retains legacy signatures',
  options,
  () => {
    const legacy = applicationSettings(applicationInput);
    assert(!Object.hasOwn(legacy, 'profileId'));
    assert(!Object.hasOwn(legacy, 'salary'));
    assert.deepEqual(applicationSettings(legacy, { legacy: true }), legacy);
    const configured = applicationSettings({
      ...applicationInput,
      profileId: 'questionnaire',
      salary,
    });
    assert.equal(configured.profileId, 'qa-profile:questionnaire');
    assert.deepEqual(
      applicationSettings(configured, { legacy: true }),
      configured
    );
    for (const extra of [
      { profileId: '../other' },
      { profileId: 1 },
      { salary: {} },
      { salary: { ...salary, currencies: [] } },
    ]) {
      assert.throws(() =>
        applicationSettings({ ...applicationInput, ...extra })
      );
    }
  }
);

test(
  'native review assembles independent salary and current contact context without writing',
  options,
  async (t) => {
    const fixture = await applicationAnswerContextFixture(t);
    const receipt = await fixture.enter(fixture.service, {
      profileId: fixture.profile.id,
      salary,
    });
    assertContext(receipt, fixture.profile);
    assert.deepEqual(fixture.state.writes, []);
    assert.equal(fixture.state.submitted, 0);
    const saved = await fixture.store.get(
      applicationSettings(applicationInput).id
    );
    assert.equal(
      readApplicationJournal(saved, applicationSettings(applicationInput))
        .options.profileId,
      fixture.profile.id
    );
  }
);

test(
  'native rereads resolve edited shared values and keep frozen salary targets',
  options,
  async (t) => {
    const fixture = await applicationAnswerContextFixture(t);
    const receipt = await fixture.enter(fixture.service, {
      profileId: fixture.profile.id,
      salary,
    });
    const edited = await saveAnswerProfile(fixture.store, {
      ...fixture.profile,
      values: { ...fixture.profile.values, email: 'current@example.test' },
    });
    const current = await fixture.service['application-read']({
      ...applicationInput,
      revision: receipt.revision,
    });
    assertContext(current, edited);
    assert(!answer(current).proposal.value.includes('owner@example.test'));
    assert.deepEqual(fixture.state.writes, []);
    assert.equal(fixture.state.submitted, 0);
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native answer context survives ${type} production API transport`,
    options,
    async (t) => {
      const fixture = await applicationAnswerContextFixture(t);
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const opened = await api.vacancyApplicationOpen({
          ...applicationInput,
          profileId: fixture.profile.id,
          salary,
        });
        const receipt = await api.vacancyApplicationAdvance({
          ...applicationInput,
          revision: opened.revision,
          action: 'enter',
          confirm: true,
        });
        assertContext(receipt, fixture.profile);
        const current = await api.vacancyApplicationStatus(applicationInput);
        assertContext(current, fixture.profile);
      });
    }
  );
}

test(
  'foreground application CLI retains explicit shared context through review and drain',
  options,
  async (t) => {
    const fixture = await applicationAnswerContextFixture(t);
    const result = await runApplicationFixtureCommand(
      fixture,
      async function* () {
        yield 'enter';
        yield 'quit';
      },
      {
        'profile-id': fixture.profile.id,
        salary: encodeWire(salary, LINO_TEXT),
      }
    );
    assert.equal(result.status, 0);
    const receipt = result.output.find((row) => row.state === 'review');
    assert(receipt);
    assertContext(receipt, fixture.profile);
    assert.equal(fixture.state.closed, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);
