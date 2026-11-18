import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplicationCommands } from '../src/cli/application-command.js';
import { applicationBatchKey } from '../src/jobs/application-batch-data.js';
import { setTimeout as delay } from 'node:timers/promises';
import {
  applicationBatchFixture,
  applicationBatchAtSend,
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationBatchFile,
  applicationBatchCommand,
} from '../src/cli/application-batch-command.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import {
  withApplicationRouteFixture,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import { applicationSessionClient } from './helpers/application-session-client.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `finite batch uses guarded production routes and validated ${type} receipts`,
    { timeout: 5000 },
    async (t) => {
      const f = applicationBatchFixture(t);
      await withApplicationRouteFixture(f, type, async (api) => {
        assert.equal((await api.vacancyApplicationBatchStatus({})).batch, null);
        let receipt = await api.vacancyApplicationBatchStart({
          ...batchInput,
          confirmations: ['send'],
        });
        for (
          let count = 0;
          count < 100 && !receipt.application?.continuation;
          count++
        ) {
          await delay(5);
          receipt = await api.vacancyApplicationBatchStatus({});
        }
        assert.equal(receipt.application.continuation.step, 'send');
        receipt = await api.vacancyApplicationBatchMode({
          ...batchInput,
          revision: receipt.batch.revision,
          paused: true,
        });
        assert.equal(receipt.batch.paused, true);
        receipt = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(receipt.batch.phase, 'stopped');
        assert.equal(receipt.application.active, true);
        assert.equal(f.state.submitted, 0);
        assert.equal(f.state.opened, 1);
        assert.equal(
          (
            await api.vacancyApplicationBatchStart({
              ...batchInput,
              confirmations: ['send'],
            })
          ).batch.phase,
          'stopped'
        );
      });
    }
  );
}
test(
  'foreground CLI cannot confirm a new vacancy using an old displayed confirmation',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t);
    const output = [];
    let closed = false;
    const stream = (async function* () {
      await f.until((r) => r.application?.continuation?.step === 'send');
      yield 'status';
      f.state.page.delivered = true;
      await f.until(
        (r) =>
          r.application?.url === batchUrls[1] &&
          r.application.continuation?.step === 'send'
      );
      yield 'confirm-send'; // The displayed receipt still belongs to the first vacancy.
      assert.equal(f.state.submitted, 0);
      yield 'review';
      yield 'confirm-send';
      await f.until((r) => r.batch.phase === 'completed');
    })();
    stream.close = () => {
      closed = true;
    };
    const status = await applicationBatchCommand(
      f.service,
      { ...batchInput, confirmations: ['send'] },
      (line) => output.push(decodeWire(line)),
      () => stream
    );
    assert.equal(status, 0);
    assert(closed);
    assert(output.some((row) => row.code === 'jobs-application-missing'));
    assert.equal(f.state.submitted, 1);
    assert.equal(output.at(-1).batch.delivered, 2);
  }
);
test(
  'batch UI renders frozen settings and truthful lifecycle controls in four languages',
  { timeout: 5000 },
  async (t) => {
    const { receipt } = await applicationBatchAtSend(t);
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { options: {}, batch: { receipt, busy: false, known: true } },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'batch.title',
        'batch.follow',
        'batch.stop',
      ]);
      assert(markup.includes('data-application-batch-settings="true"'));
      assert(!/\bapplication\.[a-z]/iu.test(markup));
      assert.match(
        markup,
        /data-application-batch-action="start"[^>]*disabled/u
      );
    }
  }
);
test(
  'following a batch adopts only its identity through status without replay or loss of another intent',
  { timeout: 5000 },
  async (t) => {
    const { f, receipt } = await applicationBatchAtSend(t);
    const client = applicationSessionClient(f);
    await client.session.followBatch(receipt.application);
    assert.deepEqual(
      client.calls.map(([name]) => name),
      ['status']
    );
    assert.equal(client.session.state.receipt.continuation.step, 'send');
    assert.equal(f.state.submitted, 0);
    assert.throws(() =>
      client.session.followBatch({ ...receipt.application, url: batchUrls[1] })
    );
    assert.equal(client.session.state.intent.url, batchUrls[0]);
  }
);

test(
  'registered foreground batch command parses a bounded URL file and delivery cap, then drains its worker',
  { timeout: 5000 },
  async (t) => {
    const f = applicationBatchFixture(t);
    const directory = await mkdtemp(join(tmpdir(), 'application-batch-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'vacancies.txt');
    await writeFile(file, batchUrls.join('\n'));
    const input = async function* () {
      for (let count = 0; count < 100; count++) {
        const saved = await f.store.get(applicationBatchKey(batchInput).id);
        if (saved?.phase === 'completed') {
          yield 'status';
          return;
        }
        await delay(5);
      }
      assert.fail('Foreground batch did not complete its finite list');
    };
    const commands = createApplicationCommands({
      ...f.serviceOptions,
      openStore: async () => f.store,
      applicationInput: input,
    });
    const output = [];
    const result = await commands['vacancies-application-batch'](
      {
        'vacancies-file': file,
        'request-id': batchInput.requestId,
        'max-applications': '1',
        'duration-ms': '60000',
        'job-application-interval': '2',
        'review-delay-ms': '0',
        'no-auto-select-resume-language': true,
        'no-collect-vacancies': true,
        confirm: 'none',
      },
      (line) => output.push(decodeWire(line))
    );
    assert.equal(result, 0);
    assert.equal(output.at(-1).batch.delivered, 1);
    assert.equal(output.at(-1).batch.settings.collectVacancies, false);
    const rows = await f.store.query();
    assert.equal(
      rows.some((row) => row.id.startsWith('assignment-vacancy:')),
      false
    );
    const journal = rows.find((row) =>
      row.id.startsWith('secret:jobs-application:')
    );
    assert.equal(journal.options.collectVacancies, false);
    assert.equal(journal.vacancy, null);
    assert.equal(f.state.opened, 1);
    assert.equal(f.state.closed, 1);
    await writeFile(file, 'x'.repeat(128001));
    await assert.rejects(
      applicationBatchFile(file),
      /at most 1,000 HH vacancy URLs/u
    );
  }
);
