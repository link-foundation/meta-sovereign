import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationPacingFixture } from '../../experiments/issue-56/application-pacing-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import {
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
  assertApplicationTranslation,
} from './helpers/application-controls.mjs';
import { wirePost } from './helpers/vacancy-routes.mjs';
import {
  applicationSessionClient,
  recoverApplicationSession,
} from './helpers/application-session-client.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `paced admission and saved eligibility cross actual ${type} routes without a second browser`,
    { timeout: 10000 },
    async (t) => {
      const f = applicationPacingFixture(t);
      await withApplicationRouteFixture(f, type, async (api, base) => {
        const receipt = await api.vacancyApplicationOpen({
          ...applicationInput,
          applicationIntervalSeconds: 0,
        });
        const first = await api.vacancyApplicationQueue({});
        assert.equal(first.pacing.intervalMs, 120000);
        await api.vacancyApplicationClose(identity(receipt));
        const refused = await wirePost(
          base,
          'application-open',
          {
            ...applicationInput,
            url: 'https://hh.ru/vacancy/456',
            requestId: 'next-paced',
          },
          type
        );
        assert.equal(refused.status, 400);
        assert.equal(refused.value.code, 'jobs-application-pace-wait');
        const other = await api.vacancyApplicationQueue({
          browserSlot: 'other',
        });
        assert.deepEqual(other.pacing, first.pacing);
        assert.equal(f.state.opened, 1);
        f.clock.value += 120000;
        assert.equal(
          (await api.vacancyApplicationQueue({})).pacing.waiting,
          false
        );
        assert.equal(
          f.state.opened,
          1,
          'reading an expired schedule never opens a browser'
        );
        assert.equal(f.state.submitted, 0);
      });
    }
  );
}

test(
  'the foreground CLI accepts a fixed interval and reports the same saved schedule through queue',
  { timeout: 5000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const result = await runApplicationFixtureCommand(
      f,
      async function* () {
        yield 'queue';
        yield 'quit';
      },
      { 'job-application-interval': '17' }
    );
    assert.equal(result.status, 0);
    const queue = result.output.find(
      (row) => row.mode === 'hh-application-queue'
    );
    assert.equal(queue.pacing.mode, 'fixed');
    assert.equal(queue.pacing.intervalMs, 17000);
    assert.equal(queue.pacing.saved, true);
    assert.equal(f.state.entered, 0);
  }
);

test(
  'a lost paced-open response recovers the same review without storing its policy or restarting the interval',
  { timeout: 5000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const client = applicationSessionClient(f);
    await client.session.select(applicationInput);
    const open = client.api.vacancyApplicationOpen;
    client.api.vacancyApplicationOpen = async (input) => {
      await open(input);
      throw new Error('Finite lost paced-open response');
    };
    await assert.rejects(
      client.session.start({
        autoSelectResumeLanguage: false,
        applicationIntervalSeconds: 0,
      })
    );
    const before = (await f.queue()).pacing;
    const recovered = await recoverApplicationSession(f, client.saved);
    assert.equal(recovered.session.state.receipt.active, true);
    assert.deepEqual((await f.queue()).pacing, before);
    assert.equal(f.state.opened, 1);
    const stored = JSON.parse([...client.saved.values.values()][0]);
    assert.deepEqual(Object.keys(stored).sort(), [
      'browserSlot',
      'requestId',
      'url',
    ]);
    await recovered.session.action('Close');
  }
);

test(
  'four-language settings and shared queue disclose adaptive/fixed timing and block new starts until refreshed',
  { timeout: 4000 },
  async (t) => {
    const f = applicationPacingFixture(t);
    const receipt = await f.open();
    await f.release(receipt);
    const queue = await f.queue();
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const application = {
        queue,
        target: applicationInput,
        known: true,
        missing: true,
        options: {
          applicationIntervalSeconds: 0,
          coverLetter: '',
          reviewDelayMs: 3000,
        },
        setOptions: () => {},
      };
      const markup = applicationPanelMarkup(application, locale);
      assert.match(markup, /data-application-pacing="waiting"/u);
      assert.match(markup, /data-application-pacing-interval="true"/u);
      assert.match(markup, /data-application-action="start" disabled=""/u);
      for (const suffix of [
        'pacingEnabled',
        'pacingInterval',
        'pacingHint',
        'pacingWaiting',
        'pacingReady',
        'pacingStats',
        'pacingMode.adaptive',
        'pacingMode.fixed',
        'pacingHold',
        'pacingUnsaved',
      ]) {
        assertApplicationTranslation(locale, suffix);
      }
      assert(markup.includes(queue.pacing.nextAt));
      const preview = applicationPanelMarkup(
        { ...application, options: { ...application.options, testMode: true } },
        locale
      );
      assert.doesNotMatch(
        preview,
        /data-application-action="start" disabled=""/u
      );
      const unsaved = applicationPanelMarkup(
        {
          ...application,
          queue: { ...queue, pacing: { ...queue.pacing, saved: false } },
        },
        locale
      );
      assert(
        unsaved.includes(assertApplicationTranslation(locale, 'pacingUnsaved'))
      );
    }
    assert.throws(
      () =>
        applicationQueueResult({
          ...queue,
          pacing: { ...queue.pacing, waiting: 'no' },
        }),
      { code: 'jobs-application-pacing-journal' }
    );
  }
);
