import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applicationLanguageFixture,
  standardLetters,
} from '../../experiments/issue-56/application-language-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  assertApplicationTranslation,
  withApplicationRouteFixture,
  runApplicationFixtureCommand,
  applicationPanelMarkup,
} from './helpers/application-controls.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `default CV language and standard letters cross ${type} without entry or sending`,
    { timeout: 10000 },
    async (t) => {
      const fixture = await applicationLanguageFixture(t, { open: false });
      await withApplicationRouteFixture(fixture, type, async (api) => {
        let result = await api.vacancyApplicationOpen({
          ...fixture.input,
          autoSelectResumeLanguage: undefined,
        });
        assert.equal(result.autoSelectResumeLanguage, true);
        result = await api.vacancyApplicationAdvance(
          identity(result, { action: 'enter', confirm: true })
        );
        assert.equal(result.resumePreference.source, 'automatic');
        assert.equal(result.letterLanguage, 'ru');
        result = await api.vacancyApplicationPrefill(
          identity(result, { part: 'cover-letter', confirm: true })
        );
        assert.equal(result.letter, 'verified');
        assert.equal(fixture.state.page.letter.value, standardLetters.ru);
        assert.equal(fixture.state.entered, 0);
        assert.equal(fixture.state.submitted, 0);
        await api.vacancyApplicationClose(identity(result));
      });
    }
  );
}

test(
  'foreground default language policy reads both standard files before safe entry',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t, { open: false });
    const en = join(fixture.artifactRoot, 'letter-en.txt');
    const ru = join(fixture.artifactRoot, 'letter-ru.txt');
    await writeFile(en, standardLetters.en);
    await writeFile(ru, standardLetters.ru);
    const actions = async function* () {
      yield 'enter';
      yield 'letter';
      yield 'quit';
    };
    const result = await runApplicationFixtureCommand(fixture, actions, {
      'no-auto-select-resume-language': false,
      'standard-letter-en-file': en,
      'standard-letter-ru-file': ru,
    });
    assert.equal(result.status, 0);
    assert.equal(result.output.at(-1).letter, 'verified');
    assert.equal(result.output.at(-1).resumePreference.source, 'automatic');
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.closed, 1);
  }
);

test('four-language settings explain frozen policy and paired standard letters with escaped owner text', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = applicationPanelMarkup(
      {
        options: {
          coverLetter: '',
          standardLetters: { en: '<Owner English>', ru: 'Письмо' },
          autoSelectResumeLanguage: true,
          reviewDelayMs: 3000,
        },
        setOptions: () => {},
        intent: null,
      },
      locale
    );
    assert(markup.includes('data-application-standard-letter="en"'));
    assert(markup.includes('data-application-standard-letter="ru"'));
    assert(markup.includes('&lt;Owner English&gt;'));
    assert(
      markup.includes('data-application-option="autoSelectResumeLanguage"')
    );
    for (const suffix of [
      'languagePolicyHint',
      'standardLettersHint',
      'standardLetter.en',
      'standardLetter.ru',
      'resumePreferenceSource.automatic',
    ]) {
      assertApplicationTranslation(locale, suffix);
    }
  }
});
