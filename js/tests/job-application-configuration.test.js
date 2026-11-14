import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationSurveyConfiguration } from '../src/cli/application-configuration.js';
import { createApplicationCommands } from '../src/cli/application-command.js';
import { decodeWire } from '../src/transport/lino.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationBatchFixture,
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { runApplicationFixtureCommand } from './helpers/application-controls.mjs';

const configurationFixture = async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'application-configuration-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, env: {} };
};

test(
  'survey configuration uses isolated CLI, environment and Lino file precedence',
  { timeout: 5000 },
  async (t) => {
    const context = await configurationFixture(t);
    const before = { ...process.env };
    const resolve = (args = {}, env = {}) =>
      applicationSurveyConfiguration(args, { ...context, env });
    assert.equal(await resolve(), true);
    await writeFile(
      join(context.cwd, '.lenv'),
      'AUTO_ANSWER_VIEWED_VACANCY: false\n'
    );
    assert.equal(await resolve(), false);
    await writeFile(
      join(context.cwd, 'selected.lenv'),
      'AUTO_ANSWER_VIEWED_VACANCY: true\n'
    );
    assert.equal(await resolve({ configuration: 'selected.lenv' }), true);
    assert.equal(
      await resolve(
        { configuration: 'selected.lenv' },
        { AUTO_ANSWER_VIEWED_VACANCY: 'false' }
      ),
      false
    );
    for (const [args, expected] of [
      [{ 'auto-answer-viewed-vacancy': true }, true],
      [{ 'auto-answer-viewed-vacancy': 'false' }, false],
      [{ 'no-auto-answer-viewed-vacancy': true }, false],
      [{ 'no-auto-answer-viewed-vacancy': 'false' }, true],
    ]) {
      assert.equal(
        await resolve(args, {
          AUTO_ANSWER_VIEWED_VACANCY: 'invalid-unused-value',
        }),
        expected
      );
    }
    assert.equal(
      await resolve(
        {},
        { AUTO_ANSWER_VIEWED_VACANCY: '0', HTTP_PROXY: 'a', http_proxy: 'b' }
      ),
      false
    );
    assert.equal(
      await resolve({}, { AUTO_ANSWER_VIEWED_VACANCY: 'TRUE' }),
      true
    );
    assert.deepEqual({ ...process.env }, before);
  }
);

test(
  'invalid survey configuration refuses without disclosing the supplied value',
  { timeout: 5000 },
  async (t) => {
    const context = await configurationFixture(t);
    await assert.rejects(
      applicationSurveyConfiguration(
        {},
        {
          ...context,
          env: { AUTO_ANSWER_VIEWED_VACANCY: 'private-invalid-value' },
        }
      ),
      (error) => {
        assert.match(error.message, /AUTO_ANSWER_VIEWED_VACANCY|boolean/u);
        assert(!error.message.includes('private-invalid-value'));
        return true;
      }
    );
    for (const args of [
      {
        'auto-answer-viewed-vacancy': true,
        'no-auto-answer-viewed-vacancy': false,
      },
      { 'auto-answer-viewed-vacancy': 'private-invalid-value' },
      { configuration: true },
      { configuration: '' },
    ]) {
      await assert.rejects(applicationSurveyConfiguration(args, context));
    }
    await writeFile(
      join(context.cwd, '.lenv'),
      'AUTO_ANSWER_VIEWED_VACANCY: private-invalid-value\n'
    );
    await assert.rejects(applicationSurveyConfiguration({}, context));
  }
);

test(
  'foreground single review freezes a saved survey opt-out; status does not resolve configuration',
  { timeout: 10000 },
  async (t) => {
    const applicationConfiguration = await configurationFixture(t);
    await writeFile(
      join(applicationConfiguration.cwd, '.lenv'),
      'AUTO_ANSWER_VIEWED_VACANCY: false\n'
    );
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const input = async function* () {
      yield 'quit';
    };
    const result = await runApplicationFixtureCommand(
      fixture,
      input,
      {},
      { applicationConfiguration }
    );
    assert.equal(result.status, 0);
    assert.equal(result.output[0].autoAnswerViewedVacancy, false);
    assert.equal(fixture.state.closed, 1);
    const commands = createApplicationCommands({
      ...fixture.serviceOptions,
      openStore: async () => fixture.store,
      applicationConfiguration: {
        ...applicationConfiguration,
        env: { AUTO_ANSWER_VIEWED_VACANCY: 'invalid-status-only' },
      },
    });
    const output = [];
    assert.equal(
      await commands['vacancies-application-status'](
        {
          url: applicationInput.url,
          'request-id': applicationInput.requestId,
          configuration: true,
        },
        (line) => output.push(decodeWire(line))
      ),
      0
    );
    assert.equal(output[0].autoAnswerViewedVacancy, false);
    assert.equal(fixture.state.opened, 1);
    assert.equal(fixture.state.entered + fixture.state.submitted, 0);
  }
);

test(
  'foreground batch freezes environment survey policy and status never starts another worker',
  { timeout: 10000 },
  async (t) => {
    const context = await configurationFixture(t);
    const file = join(context.cwd, 'vacancies.txt');
    await writeFile(file, batchUrls.join('\n'));
    const fixture = applicationBatchFixture(t);
    const commands = createApplicationCommands({
      ...fixture.serviceOptions,
      openStore: async () => fixture.store,
      applicationConfiguration: {
        ...context,
        env: { AUTO_ANSWER_VIEWED_VACANCY: 'false' },
      },
      async *applicationInput() {
        yield 'quit';
      },
    });
    const output = [];
    const log = (line) => output.push(decodeWire(line));
    assert.equal(
      await commands['vacancies-application-batch'](
        {
          'vacancies-file': file,
          'request-id': batchInput.requestId,
          'no-auto-select-resume-language': true,
          'review-delay-ms': '0',
          confirm: 'send',
        },
        log
      ),
      0
    );
    assert.equal(output[0].batch.settings.autoAnswerViewedVacancy, false);
    const opened = fixture.state.opened;
    assert.equal(
      await commands['vacancies-application-batch-status'](
        {
          'request-id': batchInput.requestId,
          'auto-answer-viewed-vacancy': 'invalid-status-only',
          configuration: true,
        },
        log
      ),
      0
    );
    assert.equal(output.at(-1).batch.settings.autoAnswerViewedVacancy, false);
    assert.equal(fixture.state.opened, opened);
    assert.equal(fixture.state.submitted, 0);
  }
);
