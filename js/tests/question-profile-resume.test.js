import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAnswerProfile } from '../src/automation/question-profile-source.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { cvToLino } from '../src/cv/model.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import {
  formModelField,
  formModelInspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  resumeCv,
  resumeMarkdown,
  githubLinks,
} from '../../experiments/issue-56/resume-profile-fixture.mjs';

const extract = (input) => extractAnswerProfile(createMemoryStore(), input);

test(
  'exported résumé Markdown proposes owner facts with exact lines and leaves work contacts out',
  { timeout: 5000 },
  async () => {
    const result = await extract({
      text: resumeMarkdown,
      format: 'resume-markdown',
    });
    assert.deepEqual(result.profile, {
      name: 'Example Alex',
      firstName: 'Alex',
      lastName: 'Example',
      birthDate: '1990-03-02',
      location: 'Hanoi',
      phone: '+1 (555) 555-0123',
      email: 'owner@example.test',
      telegram: 'https://t.me/synthetic_owner',
      github: githubLinks,
      resume: resumeCv.url,
    });
    assert.deepEqual(
      result.fields.find((f) => f.key === 'birthDate').candidates[0].evidence,
      [{ source: 'text', path: 'line:5' }]
    );
    assert.equal(result.readOnly, true);
    assert.deepEqual(
      result.fields.find((field) => field.key === 'github').candidates[0]
        .evidence,
      [{ source: 'text', path: 'line:10' }]
    );
    assert.equal(result.requiresReview, true);
  }
);

test(
  'canonical CV contacts retain birth dates, résumé URLs and every GitHub link as a list',
  { timeout: 5000 },
  async () => {
    for (const snapshot of [
      resumeCv,
      { ...resumeCv, cv: undefined, lino: cvToLino(resumeCv.cv) },
    ]) {
      const store = createMemoryStore();
      await store.put(snapshot);
      const result = await extractAnswerProfile(store, { cvId: snapshot.id });
      assert.equal(result.profile.birthDate, '1990-03-02');
      assert.equal(result.profile.resume, resumeCv.url);
      assert.equal(result.profile.github, githubLinks);
      assert.equal(
        result.profile.website,
        'https://portfolio.example.test/alex'
      );
      assert.equal(result.profile.firstName, undefined);
      assert.deepEqual(
        result.fields.find((f) => f.key === 'github').candidates[0].evidence,
        [0, 1].map((i) => ({
          source: snapshot.id,
          path: `links.${i}.url`,
          capturedAt: snapshot.capturedAt,
        }))
      );
      assert.deepEqual(await store.get(snapshot.id), snapshot);
    }
  }
);

test(
  'explicit contact labels support separate names and dates in all four UI languages',
  { timeout: 5000 },
  async () => {
    for (const text of [
      'First name: Alex\nLast name: Example\nBirth date: 02.03.1990\nGitHub: https://github.com/synthetic-owner\nRésumé: https://hh.ru/resume/synthetic-owner',
      'Имя: Alex\nФамилия: Example\nДата рождения: 2 марта 1990\nГитхаб: https://github.com/synthetic-owner\nРезюме: https://hh.ru/resume/synthetic-owner',
      'पहला नाम: Alex\nउपनाम: Example\nजन्म तिथि: 1990-03-02\nGitHub: https://github.com/synthetic-owner\nसीवी: https://hh.ru/resume/synthetic-owner',
      '名：Alex\n姓氏：Example\n出生日期：1990-03-02\nGitHub：https://github.com/synthetic-owner\n简历：https://hh.ru/resume/synthetic-owner',
    ]) {
      const result = await extract({ text });
      assert.equal(result.profile.firstName ?? result.profile.name, 'Alex');
      assert.equal(result.profile.lastName, 'Example');
      assert.equal(result.profile.birthDate, '1990-03-02');
      assert.equal(result.profile.github, 'https://github.com/synthetic-owner');
      assert.equal(result.profile.resume, resumeCv.url);
    }
  }
);

test(
  'existing private profile values stay current until the owner explicitly selects a CV alternative',
  { timeout: 5000 },
  async () => {
    const profile = {
      github: 'https://github.com/current-owner',
      birthDate: '1991-01-01',
      custom: 'Keep this',
    };
    const result = await extract({
      text: resumeMarkdown,
      format: 'resume-markdown',
      profile,
    });
    assert.equal(result.profile.github, profile.github);
    assert.equal(result.profile.birthDate, profile.birthDate);
    assert.equal(result.profile.custom, profile.custom);
    for (const key of ['github', 'birthDate']) {
      const field = result.fields.find((f) => f.key === key);
      assert.equal(field.conflict, true);
      assert.equal(field.current, profile[key]);
    }
  }
);

test(
  'invalid dates, provider lookalikes and private links have source-only skip evidence',
  { timeout: 5000 },
  async () => {
    for (const [key, text] of [
      ['birthDate', 'Birth date: 31.02.2000'],
      ['birthDate', 'Birth date: 1900-02-29'],
      ['github', 'GitHub: https://github.com.attacker.test/owner'],
      ['github', 'GitHub: https://user@github.com/owner'],
      ['resume', 'Résumé: https://hh.ru/resume/owner?secret=marker'],
      ['resume', 'Résumé: javascript:secret-marker'],
    ]) {
      const result = await extract({ text });
      assert.deepEqual(result.profile, {}, text);
      assert.equal(result.skipped[0]?.key, key, text);
      assert.deepEqual(result.skipped[0].evidence, {
        source: 'text',
        path: 'line:1',
      });
      assert.equal(
        JSON.stringify(result.skipped).includes('secret-marker'),
        false
      );
      assert.equal(
        JSON.stringify(result.skipped).includes('attacker.test'),
        false
      );
    }
    assert.equal(
      (await extract({ text: 'Birth date: 2000-02-29' })).profile.birthDate,
      '2000-02-29'
    );
  }
);

test(
  'résumé link evidence never treats the CV management URL as the owner résumé',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put({ ...resumeCv, url: 'https://hh.ru/applicant/resumes' });
    const result = await extractAnswerProfile(store, { cvId: resumeCv.id });
    assert.equal(result.profile.resume, undefined);
    assert.equal(result.profile.github, githubLinks);
  }
);

test(
  'contact Markdown does not invent name parts, load remote links or execute embedded text',
  { timeout: 5000 },
  async () => {
    const result = await extract({
      format: 'resume-markdown',
      text: '# Example Alex\n\n![portrait](https://private.example.test/pixel)\n```\nEmail: hidden@example.test\n```\n[LinkedIn](https://www.linkedin.com/in/synthetic-owner/)\nhttps://github.com/synthetic-owner',
    });
    assert.equal(result.profile.name, 'Example Alex');
    assert.equal(result.profile.firstName, undefined);
    assert.equal(result.profile.lastName, undefined);
    assert.equal(result.profile.email, undefined);
    assert.equal(result.profile.website, undefined);
    assert.equal(result.profile.github, 'https://github.com/synthetic-owner');
    assert.equal(
      result.profile.linkedin,
      'https://www.linkedin.com/in/synthetic-owner/'
    );
  }
);

test(
  'selected résumé facts flow through the shared saved profile into matching form contacts',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const draft = await extractAnswerProfile(store, {
      format: 'resume-markdown',
      text: resumeMarkdown,
    });
    const saved = await saveAnswerProfile(store, {
      id: 'resume-owner',
      name: 'Owner',
      values: draft.profile,
    });
    const result = await planFormAnswers(store, {
      inspection: formModelInspection([
        formModelField('Date of birth', { type: 'date' }),
        formModelField('GitHub'),
        formModelField('Ссылка на резюме'),
        formModelField('First name'),
        formModelField('Last name'),
      ]),
      profileId: saved.id,
    });
    assert.deepEqual(
      result.fields.map((field) => field.answer.proposal),
      [
        { value: '1990-03-02' },
        { value: githubLinks },
        { value: resumeCv.url },
        { value: 'Alex' },
        { value: 'Example' },
      ]
    );
    assert(result.fields.every((field) => field.answer.requiresReview));
  }
);

test(
  'malformed Markdown and input at the source limit remain bounded',
  { timeout: 5000 },
  async () => {
    const text = `${'['.repeat(30000)}\n${' '.repeat(30000)}x\nGitHub: https://github.com/synthetic-owner`;
    const result = await extract({ format: 'resume-markdown', text });
    assert.deepEqual(result.profile, {
      github: 'https://github.com/synthetic-owner',
    });
    await assert.rejects(
      extract({ format: 'resume-markdown', text: 'x'.repeat(64001) }),
      /64000/u
    );
  }
);

test(
  'Markdown formatting preserves literal contact characters and English export dates',
  { timeout: 5000 },
  async () => {
    const result = await extract({
      format: 'resume-markdown',
      text: '# Alex Example\n**Email:** person__alias@example.test\n**Résumé**: https://example.test/my__resume\nBorn on 2 March 1990\n## Experience — 10 years\nEmail: employer@example.test',
    });
    assert.equal(result.profile.email, 'person__alias@example.test');
    assert.equal(result.profile.resume, 'https://example.test/my__resume');
    assert.equal(result.profile.birthDate, '1990-03-02');
  }
);
