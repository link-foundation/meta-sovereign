import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applicationAnswerSalary as salary } from '../../experiments/issue-56/application-answer-context-fixture.mjs';
import {
  applicationBatchFixture,
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { withApplicationRouteFixture } from './helpers/application-controls.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
} from '../src/transport/lino.js';
import { createApplicationCommands } from '../src/cli/application-command.js';
import {
  applicationBatchKey,
  readApplicationBatch,
} from '../src/jobs/application-batch-data.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationAnswerContextFixture } from './helpers/application-answer-context.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  ApplicationAnswerSettings,
  ApplicationAnswerReceipt,
} from '../src/web/application-answer-settings.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';

const options = { timeout: 6000 };
const profileId = 'qa-profile:questionnaire';
for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `batch freezes and forwards answer context through ${type}`,
    options,
    async (t) => {
      const fixture = applicationBatchFixture(t, {
        vacancy: () => ({ ...vacancySnapshotFixture(), salary: 'от 600000 ₽' }),
      });
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let receipt = await api.vacancyApplicationBatchStart({
          ...batchInput,
          profileId,
          salary,
          confirmations: ['send'],
        });
        for (
          let count = 0;
          count < 100 && !receipt.application?.continuation;
          count++
        ) {
          await delay(5);
          receipt = await api.vacancyApplicationBatchStatus(batchInput);
        }
        assert.equal(receipt.application.continuation.step, 'send');
        assert.equal(receipt.batch.settings.profileId, profileId);
        assert.equal(receipt.application.profileId, profileId);
        assert.equal(receipt.application.salary.currencies[0].net, 6200);
        const planned = fixture.state.calls.find(
          ([kind]) => kind === 'plan'
        )[1];
        assert.equal(planned.profileId, profileId);
        assert.equal(planned.salary.currencies[1].gross, 530000);
        const row = await fixture.store.get(applicationBatchKey(batchInput).id);
        assert.equal(
          readApplicationBatch(row, applicationBatchKey(batchInput)).options
            .review.profileId,
          profileId
        );
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.settings.profileId, profileId);
        assert.equal(fixture.state.submitted, 0);
      });
    }
  );
}

test(
  'batch CLI retains context in acknowledged options and closes its worker',
  options,
  async (t) => {
    const fixture = applicationBatchFixture(t);
    const directory = await mkdtemp(join(tmpdir(), 'application-context-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'vacancies.txt');
    await writeFile(file, batchUrls.join('\n'));
    const commands = createApplicationCommands({
      ...fixture.serviceOptions,
      openStore: async () => fixture.store,
      async *applicationInput() {
        yield 'quit';
      },
    });
    const output = [];
    assert.equal(
      await commands['vacancies-application-batch'](
        {
          'vacancies-file': file,
          'request-id': batchInput.requestId,
          'profile-id': profileId,
          salary: encodeWire(salary, LINO_TEXT),
          'no-auto-select-resume-language': true,
          'test-mode': true,
        },
        (line) => output.push(decodeWire(line))
      ),
      0
    );
    assert.equal(output[0].batch.settings.profileId, profileId);
    assert.equal(output[0].batch.settings.salary.currencies[0].net, 6200);
    const row = await fixture.store.get(applicationBatchKey(batchInput).id);
    assert.equal(row.options.review.profileId, profileId);
    assert.equal(row.active, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'shared controls and frozen receipts retain localized salary and profile states in every locale',
  options,
  () => {
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const t = (key, vars) => translate(locale, key, vars);
      const markup = renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          { value: { t } },
          React.createElement(React.Fragment, null, [
            React.createElement(ApplicationAnswerSettings, {
              key: 'settings',
              application: {
                options: { profileId, salary },
                setOptions: () => {},
              },
            }),
            React.createElement(ApplicationAnswerReceipt, {
              key: 'receipt',
              receipt: { profileId, salary },
            }),
          ])
        )
      );
      for (const key of [
        'application.answerContext',
        'questions.sharedSelect',
        'questions.salaryEnabled',
        'questions.salaryApproved',
      ]) {
        const text = t(key);
        assert.notEqual(text, key);
        if (locale !== 'en') {
          assert.notEqual(text, translate('en', key));
        }
        const escaped = renderToStaticMarkup(
          React.createElement(React.Fragment, null, text)
        );
        assert(markup.includes(escaped), `${locale}:${key}`);
      }
      assert(markup.includes('qa-profile:questionnaire'));
      assert(markup.includes('$6 200'));
      assert(!/common\.(?:yes|no)/u.test(markup));
    }
  }
);

test(
  'malformed receipt context refuses, missing profiles never fabricate answers, and caller edits cannot change fixed targets',
  options,
  async (t) => {
    const fixture = await applicationAnswerContextFixture(t);
    const selectedSalary = globalThis.structuredClone(salary);
    let receipt = await fixture.enter(fixture.service, {
      profileId,
      salary: selectedSalary,
    });
    for (const extra of [
      { profileId: '../other' },
      { salary: {} },
      { profileId: 'questionnaire' },
    ]) {
      assert.throws(() =>
        applicationResult({ ...receipt, ...extra }, applicationInput)
      );
    }
    selectedSalary.currencies[0].net = 1;
    receipt = await fixture.service['application-read']({
      ...applicationInput,
      revision: receipt.revision,
    });
    assert.equal(receipt.salary.currencies[0].net, 6200);
    assert(receipt.report.fields[1].answer.proposal.value.includes('$6 200'));
    await fixture.store.delete(profileId);
    await assert.rejects(
      fixture.service['application-read']({
        ...applicationInput,
        revision: receipt.revision,
      }),
      { code: 'answer-profile-missing' }
    );
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
  }
);
