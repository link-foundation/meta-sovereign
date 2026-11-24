import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationBatchCommand } from '../src/cli/application-batch-command.js';
import { decodeWire, LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  batchAttachmentFixture,
  batchAttachmentText,
} from '../../experiments/issue-56/application-batch-attachment.mjs';
import {
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
  withApplicationRouteFixture,
} from './helpers/application-controls.mjs';

const start = (fixture, options = {}) =>
  fixture.start({
    coverLetter: batchAttachmentText,
    maxApplications: 1,
    ...options,
  });
const held = (fixture, letterAttachment) =>
  fixture.until(
    (row) =>
      row.batch.delivered === 1 &&
      row.application?.letterAttachment === letterAttachment
  );
const advance = (fixture, receipt, action) =>
  fixture.service['application-advance'](
    applicationIdentity(receipt.application, { action, confirm: true })
  );
const finished = (fixture) =>
  fixture.until((row) => row.batch.phase === 'completed');
const receiptRows = (row, state) =>
  assert.deepEqual(row.batch.letterAttachments, [{ url: batchUrls[0], state }]);

test(
  'batch honours prepare and send confirmations after counting delivery at its cap',
  { timeout: 6000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t);
    await start(fixture, { confirmations: ['cover-letter', 'send'] });
    const offered = await held(fixture, 'offered');
    receiptRows(offered, 'needs-review');
    await delay(22);
    assert.equal(
      (await fixture.status()).application.revision,
      offered.application.revision
    );
    assert.deepEqual(fixture.effects, []);
    assert.equal(fixture.state.closed, 0);
    await advance(fixture, offered, 'letter-prepare');
    const ready = await held(fixture, 'ready');
    assert.deepEqual(fixture.effects, ['attachmentOpen']);
    await advance(fixture, ready, 'letter-send');
    const done = await finished(fixture);
    receiptRows(done, 'provider-confirmed');
    assert.equal(done.batch.delivered, 1);
    assert.equal(done.batch.cursor, 1);
    assert.equal(fixture.state.closed, 1);
    assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'authorized batch attaches automatically when both confirmation steps are omitted',
  { timeout: 6000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t);
    await start(fixture);
    receiptRows(await finished(fixture), 'provider-confirmed');
    assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'closing confirmed delivery leaves an unsent attachment in recovered batch status',
  { timeout: 6000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t);
    await start(fixture, { confirmations: ['cover-letter'] });
    const offered = await held(fixture, 'offered');
    await fixture.service['application-close'](
      applicationIdentity(offered.application)
    );
    receiptRows(await finished(fixture), 'needs-review');
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    const status = await recovered['application-batch-status'](batchInput);
    receiptRows(status, 'needs-review');
    assert.equal(status.batch.active, false);
    assert.deepEqual(fixture.effects, []);
  }
);

test(
  'unknown letter stays reserved and the batch keeps the current review',
  { timeout: 7000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t, { uncertain: 'navigation' });
    await start(fixture);
    const unknown = await held(fixture, 'unknown');
    assert.equal(unknown.application.delivery, 'provider-confirmed');
    receiptRows(
      await fixture.until(
        (row) => row.batch.letterAttachments?.[0]?.state === 'unknown'
      ),
      'unknown'
    );
    await assert.rejects(advance(fixture, unknown, 'letter-send'), {
      code: 'jobs-application-already-attempted',
    });
    await fixture.stop();
    const stopped = await fixture.status();
    receiptRows(stopped, 'unknown');
    assert.equal(stopped.application.active, true);
    assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'a lost automatic dispatch response keeps the batch and its journal in owner review',
  { timeout: 6000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t, { uncertain: 'lost' });
    await start(fixture);
    const unknown = await fixture.until(
      (row) =>
        row.application?.letterAttachment === 'unknown' &&
        row.batch.letterAttachments?.[0]?.state === 'unknown'
    );
    assert.equal(unknown.batch.phase, 'review');
    assert.equal(unknown.batch.active, true);
    await fixture.stop();
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    receiptRows(
      await recovered['application-batch-status'](batchInput),
      'unknown'
    );
    const application = await recovered['application-status'](
      unknown.application
    );
    assert.equal(application.letterAttachment, 'unknown');
    assert.equal(application.delivery, 'provider-confirmed');
    assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'foreground CLI confirms each batch letter action from the displayed receipt',
  { timeout: 6000 },
  async (t) => {
    const fixture = batchAttachmentFixture(t);
    const output = [];
    const commands = async function* () {
      await held(fixture, 'offered');
      yield 'status';
      yield 'letter-prepare';
      await held(fixture, 'ready');
      yield 'letter-send';
      await finished(fixture);
    };
    const status = await applicationBatchCommand(
      fixture.service,
      {
        ...batchInput,
        coverLetter: batchAttachmentText,
        maxApplications: 1,
        confirmations: ['cover-letter', 'send'],
      },
      (line) => output.push(decodeWire(line)),
      commands
    );
    assert.equal(status, 0);
    assert(output.some((row) => row.letterAttachment === 'ready'));
    assert(output.some((row) => row.letterAttachment === 'provider-confirmed'));
    receiptRows(output.at(-1), 'provider-confirmed');
    assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
  }
);

for (const format of [LINO_TEXT, LINO_BINARY]) {
  test(
    `batch and separate attachment receipts stay distinct in ${format}`,
    { timeout: 7000 },
    async (t) => {
      const fixture = batchAttachmentFixture(t);
      await withApplicationRouteFixture(fixture, format, async (api) => {
        await api.vacancyApplicationBatchStart({
          ...batchInput,
          coverLetter: batchAttachmentText,
          maxApplications: 1,
          confirmations: ['cover-letter', 'send'],
        });
        const status = () => api.vacancyApplicationBatchStatus(batchInput);
        let offered = await status();
        for (let i = 0; i < 80 && !offered.batch.letterAttachments; i += 1) {
          await delay(5);
          offered = await status();
        }
        receiptRows(offered, 'needs-review');
        assert.equal(offered.application.letterAttachment, 'offered');
        const ready = await api.vacancyApplicationAdvance(
          applicationIdentity(offered.application, {
            action: 'letter-prepare',
            confirm: true,
          })
        );
        assert.equal(ready.letterAttachment, 'ready');
        const sent = await api.vacancyApplicationAdvance(
          applicationIdentity(ready, { action: 'letter-send', confirm: true })
        );
        assert.equal(sent.letterAttachment, 'provider-confirmed');
        assert.equal(sent.delivery, 'provider-confirmed');
        let done = await status();
        for (let i = 0; i < 80 && done.batch.phase !== 'completed'; i += 1) {
          await delay(5);
          done = await status();
        }
        assert.equal(done.batch.phase, 'completed');
        receiptRows(done, 'provider-confirmed');
        if (format === LINO_TEXT) {
          for (const locale of ['en', 'ru', 'hi', 'zh']) {
            const markup = applicationPanelMarkup(
              {
                options: {},
                batch: { receipt: done, busy: false, known: true },
              },
              locale
            );
            assertApplicationLocaleMarkup(markup, locale, [
              'batch.letters',
              'attachment.provider-confirmed',
            ]);
            assert(markup.includes(batchUrls[0]));
          }
        }
      });
      assert.deepEqual(fixture.effects, ['attachmentOpen', 'attachmentSend']);
    }
  );
}
