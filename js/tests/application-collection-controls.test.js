import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationBatchFixture,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  withApplicationRouteFixture,
  successfulApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { createApplicationCommands } from '../src/cli/application-command.js';
import { applicationBatchResult } from '../src/jobs/application-batch-data.js';

const options = { timeout: 6000 };
const input = { ...applicationInput, collectVacancies: false };
for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `collection choice and truthful recovery use ${type}`,
    options,
    async (t) => {
      const f = applicationFixture();
      t.after(() => f.close());
      await withApplicationRouteFixture(f, type, async (api) => {
        const opened = await api.vacancyApplicationOpen(input);
        assert.equal(opened.collectVacancies, false);
        assert(opened.vacancy.description);
        const status = await api.vacancyApplicationStatus(input);
        assert.equal(status.collectVacancies, false);
        assert.equal(
          (await f.store.query()).some((row) =>
            row.id.startsWith('assignment-vacancy:')
          ),
          false
        );
        assert.throws(
          () => applicationResult({ ...opened, collectVacancies: true }, input),
          { code: 'jobs-application-unconfirmed' }
        );
        assert.throws(
          () =>
            applicationResult(
              { ...opened, collectVacancies: 'false' },
              applicationInput
            ),
          { code: 'jobs-application-unconfirmed' }
        );
        const closed = await api.vacancyApplicationClose({
          ...input,
          revision: status.revision,
        });
        assert.equal(closed.collectVacancies, false);
        assert.equal(f.state.submitted, 0);
      });
    }
  );
  test(
    `batch freezes the collection choice through ${type}`,
    options,
    async (t) => {
      const f = applicationBatchFixture(t);
      await withApplicationRouteFixture(f, type, async (api) => {
        const batch = await api.vacancyApplicationBatchStart({
          ...batchInput,
          collectVacancies: false,
          confirmations: ['send'],
        });
        assert.equal(batch.batch.settings.collectVacancies, false);
        assert.throws(
          () =>
            applicationBatchResult(
              {
                ...batch,
                batch: {
                  ...batch.batch,
                  settings: { ...batch.batch.settings, collectVacancies: true },
                },
              },
              { ...batchInput, collectVacancies: false }
            ),
          { code: 'jobs-application-batch-recovery' }
        );
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.settings.collectVacancies, false);
        for (const locale of ['en', 'ru', 'hi', 'zh']) {
          const markup = applicationPanelMarkup(
            {
              options: {},
              batch: { receipt: stopped, busy: false, known: true },
            },
            locale
          );
          assert(markup.includes('data-application-collection="memory"'));
          assertApplicationLocaleMarkup(markup, locale, ['collectionMemory']);
        }
        assert.equal(f.state.submitted, 0);
        assert.equal(
          (await f.store.query()).some((row) =>
            row.id.startsWith('assignment-vacancy:')
          ),
          false
        );
      });
    }
  );
}

test(
  'foreground CLI disables collection and validates malformed flags before opening storage',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const output = await successfulApplicationFixtureCommand(
      f,
      async function* () {
        yield 'quit';
      },
      { 'no-collect-vacancies': true }
    );
    assert.equal(output[0].collectVacancies, false);
    assert.equal(
      (await f.store.query()).some((row) =>
        row.id.startsWith('assignment-vacancy:')
      ),
      false
    );
    const commands = createApplicationCommands({
      openStore: () => assert.fail('invalid flag must not open storage'),
    });
    await assert.rejects(
      commands['vacancies-application'](
        {
          url: input.url,
          'request-id': input.requestId,
          'no-collect-vacancies': 'sometimes',
        },
        () => {}
      ),
      /must be true or false/u
    );
  }
);

test(
  'four-language controls disclose RAM and restart limits with the frozen receipt',
  options,
  async (t) => {
    const f = applicationFixture();
    t.after(() => f.close());
    const receipt = await f.service['application-open'](input);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { receipt, options: { collectVacancies: false } },
        locale
      );
      assert(markup.includes('data-application-option="collectVacancies"'));
      assert(markup.includes('data-application-collection="memory"'));
      assertApplicationLocaleMarkup(markup, locale, [
        'collectVacancies',
        'collectionHint',
        'collectionMemory',
      ]);
    }
  }
);
