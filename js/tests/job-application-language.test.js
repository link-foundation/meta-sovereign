import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationLanguageFixture,
  standardLetters,
} from '../../experiments/issue-56/application-language-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  applicationSettings,
  applicationKey,
} from '../src/jobs/application-options.js';
import { createVacancyService } from '../src/jobs/service.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';

const enter = (fixture, receipt = fixture.opened) =>
  fixture.service['application-advance'](
    identity(receipt, { action: 'enter', confirm: true })
  );
const letter = (fixture, receipt) =>
  fixture.service['application-prefill'](
    identity(receipt, { part: 'cover-letter', confirm: true })
  );
const read = (fixture, receipt) =>
  fixture.service['application-read'](identity(receipt));
const refusesUnverifiedLetter = (fixture, receipt) =>
  assert.rejects(
    fixture.service['application-advance'](
      identity(receipt, { action: 'submit', confirm: true })
    ),
    { code: 'jobs-application-letter' }
  );
const restart = async (fixture, receipt) => {
  await fixture.service.stop();
  fixture.service = createVacancyService(fixture.serviceOptions);
  const status = await fixture.service['application-status'](identity(receipt));
  assert.equal(status.active, false);
  return fixture.service['application-open']({
    ...fixture.input,
    recover: true,
  });
};

test(
  'new application language defaults are frozen while legacy signatures keep their original entry behavior',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    const fresh = applicationSettings({
      ...fixture.input,
      autoSelectResumeLanguage: undefined,
    });
    assert.equal(fresh.autoSelectResumeLanguage, true);
    const row = await fixture.store.get(applicationKey(fixture.input).id);
    delete row.options.autoSelectResumeLanguage;
    delete row.options.standardLetters;
    delete row.letterTemplate;
    row.signature = JSON.stringify(row.options);
    assert.equal(
      readApplicationJournal(row, applicationKey(fixture.input)).options
        .autoSelectResumeLanguage,
      undefined
    );
    await fixture.store.put(row);
    const recovered = await restart(fixture, fixture.opened);
    assert.equal(recovered.autoSelectResumeLanguage, false);
    assert.equal(recovered.letter, 'not-requested');
    assert.equal(fixture.state.navigated, undefined);
    assert.equal(fixture.state.resumeWrites, 0);
  }
);

test(
  'confirmed entry opens the full form and verifies one automatic CV choice before any potentially immediate entry',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    const result = await enter(fixture);
    assert.equal(fixture.state.navigated, 1);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(result.attempted, { enter: false, submit: false });
    assert.equal(result.resumePreference.source, 'automatic');
    assert.equal(result.resumePreference.hash, 'english');
    assert.equal(result.letterLanguage, 'ru');
    assert.equal(fixture.state.resumeWrites, 1);
    const filled = await letter(fixture, result);
    assert.equal(filled.letter, 'verified');
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.menuClicks, 2);
    assert.equal(fixture.state.fields[1].value, '');
  }
);

test(
  'an already correct checked CV needs no chooser access and survives read-only restart',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t, {
      vacancy: { salary: 'USD 3000' },
    });
    let result = await enter(fixture);
    assert.equal(result.letterLanguage, 'en');
    assert.equal(fixture.state.menuClicks, 0);
    assert.equal(fixture.state.resumeWrites, 0);
    result = await restart(fixture, result);
    assert.equal(result.resumePreference.source, 'automatic');
    await letter(fixture, result);
    assert.equal(fixture.state.page.letter.value, standardLetters.en);
    assert.equal(fixture.state.menuClicks, 0);
    assert.equal(fixture.state.entered, 0);
  }
);

test(
  'a corrected language replaces only acknowledged unchanged standard text across restart and preserves answers',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await letter(fixture, await enter(fixture));
    fixture.state.fields[1].value = 'Мой ответ сохраняется.';
    fixture.state.fields[1].label = 'What compensation do you expect in USD?';
    result = await read(fixture, result);
    result = await restart(fixture, result);
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
    result = await letter(fixture, result);
    assert.equal(result.resumePreference.source, 'automatic');
    assert.equal(result.resumePreference.hash, 'russian-old');
    assert.equal(result.letterLanguage, 'en');
    assert.equal(result.letter, 'verified');
    assert.equal(fixture.state.page.letter.value, standardLetters.en);
    assert.equal(fixture.state.fields[1].value, 'Мой ответ сохраняется.');
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'owner-edited letters block standard correction and automatic sending without changing answers',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await letter(fixture, await enter(fixture));
    fixture.state.page.letter.value = 'Моё собственное письмо.';
    fixture.state.fields[1].label = 'What compensation do you expect in USD?';
    fixture.state.fields[1].value = 'Owner answer.';
    result = await read(fixture, result);
    result = await letter(fixture, result);
    assert.equal(result.letter, 'owner-conflict');
    assert.equal(fixture.state.page.letter.value, 'Моё собственное письмо.');
    assert.equal(fixture.state.fields[1].value, 'Owner answer.');
    await refusesUnverifiedLetter(fixture, result);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a separately confirmed owner choice wins over context after restart without a replay',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await enter(fixture);
    result = await fixture.service['application-resume'](
      identity(result, { action: 'menu', confirm: true })
    );
    result = await fixture.service['application-resume'](
      identity(result, {
        action: 'choose',
        resume: 'russian-old',
        confirm: true,
      })
    );
    result = await restart(fixture, result);
    const writes = fixture.state.resumeWrites;
    result = await letter(fixture, result);
    assert.equal(result.resumePreference.source, 'manual');
    assert.equal(result.letterLanguage, 'en');
    assert.equal(fixture.state.page.letter.value, standardLetters.en);
    assert.equal(fixture.state.resumeWrites, writes);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'preview, absent confirmation, stale pages and missing export proof never issue an entry or send',
  { timeout: 5000 },
  async (t) => {
    const preview = await applicationLanguageFixture(t, {
      input: { testMode: true },
    });
    assert.equal((await enter(preview)).state, 'test-preview');
    assert.equal(preview.state.navigated, undefined);
    const fixture = await applicationLanguageFixture(t);
    await assert.rejects(
      fixture.service['application-advance'](
        identity(fixture.opened, { action: 'enter' })
      ),
      { code: 'jobs-application-confirmation' }
    );
    await assert.rejects(
      fixture.service['application-advance'](
        identity(fixture.opened, { action: 'reenter', confirm: true })
      ),
      { code: 'jobs-application-already-attempted' }
    );
    await fixture.store.delete('jobs-resume-export:jobs:english');
    await assert.rejects(enter(fixture), {
      code: 'jobs-application-resume-export',
    });
    assert.equal(fixture.state.resumeWrites, 0);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'malformed settings or forged standard-letter history cannot authorize replacement',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    for (const extra of [
      { autoSelectResumeLanguage: 'true' },
      { standardLetters: { en: 'Only one.' } },
      { coverLetter: 'Custom plus variants' },
    ]) {
      assert.throws(() => applicationSettings({ ...fixture.input, ...extra }));
    }
    await letter(fixture, await enter(fixture));
    const key = applicationKey(fixture.input);
    const row = await fixture.store.get(key.id);
    for (const change of [
      { text: 'Forged owner text' },
      { language: 'other' },
      { hash: '../bad' },
      { extra: true },
    ]) {
      assert.throws(() =>
        readApplicationJournal(
          { ...row, letterTemplate: { ...row.letterTemplate, ...change } },
          key
        )
      );
    }
  }
);

test(
  'a native owner CV change survives restart and prevents automatic replacement',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await enter(fixture);
    fixture.state.page.resumeChooser.title = 'Старое резюме';
    result = await read(fixture, result);
    assert.equal(result.resumePreference.source, 'native');
    result = await restart(fixture, result);
    const writes = fixture.state.resumeWrites;
    result = await letter(fixture, result);
    assert.equal(result.resumePreference.source, 'native');
    assert.equal(result.letterLanguage, 'en');
    assert.equal(fixture.state.page.letter.value, standardLetters.en);
    assert.equal(fixture.state.resumeWrites, writes);
  }
);

test(
  'an unacknowledged standard write cannot authorize replacement of its text',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await enter(fixture);
    const put = fixture.store.put.bind(fixture.store);
    fixture.store.put = async (row) => {
      if (row.letterTemplate) {
        throw new Error('Checkpoint unavailable');
      }
      return put(row);
    };
    await assert.rejects(letter(fixture, result), /Checkpoint unavailable/);
    fixture.store.put = put;
    result = await fixture.service['application-status'](identity(result));
    const key = applicationKey(fixture.input);
    assert.equal((await fixture.store.get(key.id)).letterTemplate, null);
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
    fixture.state.fields[1].label = 'What compensation do you expect in USD?';
    result = await read(fixture, result);
    result = await letter(fixture, result);
    assert.equal(result.letter, 'owner-conflict');
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'explicit policy opt-out retains direct entry while paired letters still use the full form without choosing',
  { timeout: 5000 },
  async (t) => {
    const legacy = await applicationLanguageFixture(t, {
      input: { autoSelectResumeLanguage: false, standardLetters: undefined },
    });
    await enter(legacy);
    assert.equal(legacy.state.navigated, undefined);
    assert.equal(legacy.state.entered, 1);
    assert.equal(legacy.state.resumeWrites, 0);
    const paired = await applicationLanguageFixture(t, {
      input: { autoSelectResumeLanguage: false },
    });
    let result = await enter(paired);
    result = await letter(paired, result);
    assert.equal(paired.state.navigated, 1);
    assert.equal(paired.state.entered, 0);
    assert.equal(paired.state.resumeWrites, 0);
    assert.equal(result.letterLanguage, 'en');
    assert.equal(paired.state.page.letter.value, standardLetters.en);
  }
);

test(
  'a changed context at submit cannot send a stale standard letter',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationLanguageFixture(t);
    let result = await letter(fixture, await enter(fixture));
    fixture.state.fields[1].label = 'What compensation do you expect in USD?';
    result = await read(fixture, result);
    await refusesUnverifiedLetter(fixture, result);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.page.letter.value, standardLetters.ru);
  }
);
