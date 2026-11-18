import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { salaryBatchFixture } from '../../experiments/issue-56/application-salary-batch-fixture.mjs';
import { applicationSalary } from '../../experiments/issue-56/application-salary-fixture.mjs';
import {
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationBatchCommand } from '../src/cli/application-batch-command.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import {
  withApplicationRouteFixture,
  applicationPanelMarkup,
} from './helpers/application-controls.mjs';
import { translate } from '../src/web/i18n.js';

const waitFor = async (api, predicate) => {
  for (let count = 0; count < 200; count++) {
    const receipt = await api.vacancyApplicationBatchStatus(batchInput);
    if (predicate(receipt)) {
      return receipt;
    }
    await delay(5);
  }
  assert.fail('Salary batch interface did not reach its bounded checkpoint.');
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `salary batch progress crosses production ${type} routes and translated controls`,
    { timeout: 6000 },
    async (t) => {
      const f = salaryBatchFixture(t);
      await withApplicationRouteFixture(f, type, async (api) => {
        await api.vacancyApplicationBatchStart({
          ...batchInput,
          salary: applicationSalary,
          confirmations: ['send'],
        });
        const high = await waitFor(
          api,
          (r) => r.application?.continuation?.step === 'send'
        );
        assert.equal(high.application.url, batchUrls[1]);
        assert.equal(high.batch.salaryDeferred, 1);
        await api.vacancyApplicationContinue(
          applicationIdentity(high.application, { step: 'send', confirm: true })
        );
        const lower = await waitFor(
          api,
          (r) =>
            r.application?.url === batchUrls[0] &&
            r.application.continuation?.step === 'send'
        );
        assert.equal(lower.batch.salaryFloorRub, 400000);
        assert.equal(lower.application.salaryFloorRub, 400000);
        for (const locale of ['en', 'ru', 'hi', 'zh']) {
          const markup = applicationPanelMarkup(
            {
              options: {},
              batch: { receipt: lower, busy: false, known: true },
            },
            locale
          );
          assert(markup.includes('data-application-batch-salary="true"'));
          assert(
            markup.includes(
              translate(locale, 'application.batch.salaryDeferred', {
                count: 0,
              })
            )
          );
          assert(!/\bapplication\.[a-z]/iu.test(markup));
        }
        await api.vacancyApplicationContinue(
          applicationIdentity(lower.application, {
            step: 'send',
            confirm: true,
          })
        );
        const done = await waitFor(api, (r) => r.batch.phase === 'completed');
        assert.equal(done.batch.delivered, 2);
        assert.equal(done.batch.salaryDeferred, 0);
      });
    }
  );
}

test(
  'foreground batch CLI reports a lowered tier and drains after both confirmed deliveries',
  { timeout: 6000 },
  async (t) => {
    const f = salaryBatchFixture(t);
    const output = [];
    let closed = false;
    const stream = (async function* () {
      await f.until((r) => r.batch.phase === 'completed');
      yield 'status';
    })();
    stream.close = () => {
      closed = true;
    };
    const status = await applicationBatchCommand(
      f.service,
      { ...batchInput, salary: applicationSalary, confirmations: [] },
      (line) => output.push(decodeWire(line)),
      () => stream
    );
    assert.equal(status, 0);
    assert.equal(output.at(-1).batch.delivered, 2);
    assert.equal(output.at(-1).batch.salaryFloorRub, 400000);
    assert.equal(output.at(-1).batch.salaryTier, 1);
    assert.equal(f.state.submitted, 2);
    assert.equal(f.state.closed, 3);
    assert(closed);
  }
);
