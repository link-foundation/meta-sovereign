import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationBatchFixture,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationResult } from '../src/jobs/application-result.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { withApplicationRouteFixture } from './helpers/application-controls.mjs';

const recruiterPanelFixture = (t) =>
  applicationBatchFixture(t, {
    vacancyPage: (state) => {
      Object.assign(state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
    },
  });

const review = (fixture, state) =>
  fixture.until(
    (row) =>
      row.batch.delivered === 1 && row.application?.recruiterChat === state
  );

test('a confirmed batch holds the owned recruiter panel at its delivery cap', async (t) => {
  const fixture = recruiterPanelFixture(t);
  await fixture.start({ maxApplications: 1 });
  const opened = await review(fixture, 'open');
  assert.equal(opened.batch.phase, 'review');
  assert.equal(opened.batch.cursor, 1);
  assert.equal(opened.application.delivery, 'provider-confirmed');
  assert.equal(fixture.state.closed, 0);
  assert.equal(fixture.state.submitted, 0);
  assert.deepEqual(
    fixture.state.admissions.map(({ url }) => url),
    [batchUrls[0]]
  );

  fixture.state.page.recruiterPanelOpen = false;
  const completed = await fixture.until(
    (row) => row.batch.phase === 'completed'
  );
  assert.equal(completed.batch.delivered, 1);
  assert.equal(fixture.state.closed, 1);
  assert.equal(fixture.state.submitted, 0);
});

test('an unverified page cannot clear a visible recruiter panel hold', async (t) => {
  const fixture = recruiterPanelFixture(t);
  await fixture.start({ maxApplications: 1 });
  await review(fixture, 'open');
  fixture.state.page.bound = false;
  fixture.state.page.url = 'https://hh.ru/chat/456';
  delete fixture.state.page.recruiterPanelOpen;
  const changed = await review(fixture, 'unverified');
  assert.equal(changed.batch.phase, 'review');
  assert.equal(fixture.state.closed, 0);

  await fixture.stop();
  const stopped = await fixture.status();
  assert.equal(stopped.batch.phase, 'stopped');
  assert.equal(stopped.application.active, true);
  assert.equal(stopped.application.recruiterChat, 'unverified');
  assert.equal(fixture.state.closed, 0);
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`only a live confirmed receipt exposes recruiter review through ${type}`, async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    await withApplicationRouteFixture(fixture, type, async (api) => {
      const opened = await api.vacancyApplicationOpen(applicationInput);
      Object.assign(fixture.state.page, {
        delivered: true,
        enter: null,
        recruiterPanelOpen: true,
      });
      const receipt = await api.vacancyApplicationRead({
        ...applicationInput,
        revision: opened.revision,
      });
      assert.equal(receipt.recruiterChat, 'open');
      assert.equal(receipt.delivery, 'provider-confirmed');
      assert.equal(Object.hasOwn(receipt.page, 'recruiterPanelOpen'), false);
      assert.throws(() =>
        applicationResult(
          { ...opened, recruiterChat: 'open' },
          applicationInput
        )
      );
      const closed = await api.vacancyApplicationClose({
        ...applicationInput,
        revision: receipt.revision,
      });
      assert.equal(closed.recruiterChat, undefined);
      assert.equal(closed.delivery, 'provider-confirmed');
    });
  });
}
