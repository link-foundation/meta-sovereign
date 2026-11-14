import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationContextFixture } from '../../experiments/issue-56/application-context-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  assertApplicationTranslation,
  withApplicationRouteFixture,
  enterApplicationRoute,
  runApplicationFixtureCommand,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createApplicationApi } from '../src/web/application-api.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `contextual choice carries employer evidence through ${type} without sending`,
    { timeout: 10000 },
    async (t) => {
      const fixture = await applicationContextFixture(t, { enter: false });
      fixture.state.fields[1].label =
        'Расскажите о вашем последнем опыте работы';
      await withApplicationRouteFixture(fixture, type, async (api) => {
        const receipt = await enterApplicationRoute(api);
        const selected = await api.vacancyApplicationResume(
          identity(receipt, { action: 'context', confirm: true })
        );
        assert.deepEqual(selected.resumeContext, {
          language: 'ru',
          reason: 'questions',
        });
        assert.equal(selected.resumeSelection.languageProof.language, 'ru');
        assert.equal(selected.resumePreference.source, 'context');
        assert.equal(fixture.state.resumeWrites, 1);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(selected));
      });
    }
  );
}

test(
  'foreground context-resume confirms one checked choice and closes without sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t, { enter: false });
    fixture.state.fields[1].label = 'Расскажите о вашем последнем опыте работы';
    const actions = async function* () {
      yield 'enter';
      yield 'context-resume';
      yield 'quit';
    };
    const { status, output } = await runApplicationFixtureCommand(
      fixture,
      actions
    );
    assert.equal(status, 0);
    assert(output[1].commands.includes('context-resume'));
    assert.equal(output.at(-1).resumeSelection.languageProof.language, 'ru');
    assert.equal(output.at(-1).resumePreference.source, 'context');
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 1);
  }
);

test(
  'browser context API refuses absent or contradictory proof with one transport attempt',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationContextFixture(t);
    const result = await fixture.context(fixture.entered);
    const input = identity(fixture.entered, {
      action: 'context',
      confirm: true,
    });
    let raw = result,
      calls = 0;
    const api = createApplicationApi({
      report: async () => {
        calls++;
        return raw;
      },
    });
    await api.vacancyApplicationResume(input);
    raw = { ...result, resumeSelection: undefined };
    await assert.rejects(api.vacancyApplicationResume(input), {
      code: 'jobs-application-unconfirmed',
    });
    raw = {
      ...result,
      resumeContext: { language: 'en', reason: 'dollar-pay' },
    };
    await assert.rejects(api.vacancyApplicationResume(input), {
      code: 'jobs-application-unconfirmed',
    });
    assert.equal(calls, 3);
    assert.equal(fixture.state.resumeWrites, 1);
  }
);

test('all context decision labels and action names are translated in four locales', () => {
  const keys = [
    'resumeContext',
    'resumeContextUnknown',
    'resumeContextChoose',
    ...['dollar-pay', 'questions', 'description', 'title'].map(
      (key) => `resumeReason.${key}`
    ),
  ];
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const suffix of keys) {
      assertApplicationTranslation(locale, suffix);
    }
  }
});
