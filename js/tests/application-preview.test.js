import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationPreviewFixture,
  waitForApplicationPreview,
} from '../../experiments/issue-56/application-preview-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import {
  applicationSettings,
  applicationDelay,
} from '../src/jobs/application-options.js';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  scrollApplicationVacancy,
  previewVacancyDocument,
} from '../src/jobs/application-preview.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';

const noIssue = async (fixture) => {
  assert.equal(fixture.state.navigated ?? 0, 0);
  assert.equal(fixture.state.entered, 0);
  assert.equal(fixture.state.submitted, 0);
  const saved = await fixture.store.get('secret:jobs-application:jobs:123');
  assert.deepEqual(saved.attempted, { enter: false, submit: false });
  assert.equal(saved.delivery, 'none');
};

for (const action of ['enter', 'form']) {
  test(
    `${action} previews the reviewed description for three seconds before issuing`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationPreviewFixture(t, { block: true });
      const pending = fixture.advance(action);
      pending.catch(() => {});
      await waitForApplicationPreview(fixture, pending);
      await noIssue(fixture);
      assert.deepEqual(fixture.calls, [
        {
          url: applicationInput.url,
          documentKey: 'fixture-document',
          description: fixture.opened.vacancy.description,
          scroll: true,
        },
        { wait: 3000 },
      ]);
      fixture.release.resolve();
      const receipt = await pending;
      assert.equal(receipt.state, 'review');
      assert.equal(receipt.vacancyPreviewSeconds, 3);
      assert.equal(fixture.calls.at(-1).scroll, false);
      assert.equal(fixture.state.entered + (fixture.state.navigated ?? 0), 1);
      assert.equal(fixture.state.submitted, 0);
    }
  );

  test(
    `${action} honors the explicit zero-second preview and preserves its acknowledged option`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationPreviewFixture(t, {
        input: { vacancyPreviewSeconds: 0 },
      });
      await fixture.advance(action);
      assert.deepEqual(
        fixture.calls.map((value) => value.wait ?? value.scroll),
        [true, 0, false]
      );
      const key = applicationSettings({
        ...applicationInput,
        vacancyPreviewSeconds: 0,
      });
      const saved = await fixture.store.get(key.id);
      assert.equal(saved.options.vacancyPreviewSeconds, 0);
      assert.equal(
        readApplicationJournal(saved, key).signature,
        saved.signature
      );
      const calls = fixture.calls.length;
      await fixture.service['application-status'](applicationInput);
      assert.equal(fixture.calls.length, calls);
    }
  );

  for (const change of [
    { documentKey: 'owner-replaced-document' },
    { challenge: true },
    { questions: true },
    { enter: { qa: 'vacancy-response-link-top', disabled: true } },
  ]) {
    test(
      `${action} refuses native change during preview: ${Object.keys(change)[0]}`,
      { timeout: 5000 },
      async (t) => {
        const fixture = await applicationPreviewFixture(t, {
          afterWait: (owned) => Object.assign(owned.state.page, change),
        });
        await assert.rejects(fixture.advance(action), {
          code: 'jobs-application-changed',
        });
        await noIssue(fixture);
      }
    );
  }

  test(
    `${action} refuses replaced description after the delay without reserving entry`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationPreviewFixture(t, {
        preview: (value) => value.scroll,
      });
      await assert.rejects(fixture.advance(action), {
        code: 'jobs-application-changed',
      });
      await noIssue(fixture);
      assert.deepEqual(
        fixture.calls.map((value) => value.wait ?? value.scroll),
        [true, 3000, false]
      );
    }
  );

  test(
    `${action} Stop drains the preview without issuing or reserving delivery`,
    { timeout: 5000 },
    async (t) => {
      const fixture = await applicationPreviewFixture(t, { block: true });
      const pending = fixture.advance(action);
      const refused = assert.rejects(pending, { name: 'AbortError' });
      refused.catch(() => {});
      await waitForApplicationPreview(fixture, pending);
      await fixture.service.cancel();
      await refused;
      await noIssue(fixture);
      assert.equal(fixture.calls.length, 2);
    }
  );

  test(
    `${action} test mode and refused scrolling never start a preview wait`,
    { timeout: 5000 },
    async (t) => {
      const preview = await applicationPreviewFixture(t, {
        input: { testMode: true },
      });
      assert.equal((await preview.advance(action)).state, 'test-preview');
      assert.deepEqual(preview.calls, []);
      await noIssue(preview);
      const refused = await applicationPreviewFixture(t, { preview: false });
      await assert.rejects(refused.advance(action), {
        code: 'jobs-application-changed',
      });
      assert.equal(refused.calls.length, 1);
      await noIssue(refused);
    }
  );
}

test('preview timing validates finite seconds without rewriting legacy signatures', () => {
  const legacy = applicationSettings(applicationInput);
  assert.equal(Object.hasOwn(legacy, 'vacancyPreviewSeconds'), false);
  assert.deepEqual(applicationSettings(legacy, { legacy: true }), legacy);
  for (const seconds of [0, 0.1, 3, 30]) {
    assert.equal(
      applicationSettings({
        ...applicationInput,
        vacancyPreviewSeconds: seconds,
      }).vacancyPreviewSeconds,
      seconds
    );
  }
  for (const seconds of [
    -1,
    31,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    true,
    '3',
    {},
  ]) {
    assert.throws(
      () =>
        applicationSettings({
          ...applicationInput,
          vacancyPreviewSeconds: seconds,
        }),
      { code: 'jobs-application-input' }
    );
  }
});

test(
  'real preview delay releases promptly on Stop and allows zero seconds',
  { timeout: 2000 },
  async () => {
    const controller = new AbortController();
    const waiting = applicationDelay(3000, controller.signal);
    const refused = assert.rejects(waiting, { name: 'AbortError' });
    controller.abort();
    await refused;
    await applicationDelay(0, new AbortController().signal);
  }
);

test(
  'read and interrupted recovery never scroll or replay preview or entry',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationPreviewFixture(t);
    const read = await fixture.service['application-read'](
      applicationIdentity(fixture.opened)
    );
    assert.equal(read.state, 'ready');
    await fixture.service['application-close'](applicationIdentity(read));
    await fixture.service['application-status'](applicationInput);
    assert.deepEqual(fixture.calls, []);
    await noIssue(fixture);
  }
);

test('native preview uses the commander function-and-arguments contract', async () => {
  const input = {
    url: applicationInput.url,
    documentKey: 'owned',
    description: 'Full prose',
    scroll: true,
  };
  let received;
  const result = await scrollApplicationVacancy(
    {
      commander: {
        evaluate: async (request) => {
          received = request;
          return true;
        },
      },
    },
    input
  );
  assert.equal(result, true);
  assert.equal(received.fn, previewVacancyDocument);
  assert.deepEqual(received.args, [input]);
});
