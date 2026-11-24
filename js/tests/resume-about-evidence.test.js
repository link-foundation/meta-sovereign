import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceFromHhExport } from '../src/cv/experience-hh.js';
import {
  experienceDocumentFromLino,
  experienceDocumentToLino,
} from '../src/cv/experience-document.js';
import {
  resumeCvFromLino,
  resumeCvLino,
  sanitizedResumeCv,
} from '../src/jobs/resume-cv.js';
import { verifyCvSave } from '../src/jobs/cv-watch-verification.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { resumeCvFixture } from '../../experiments/issue-56/resume-export-fixture.mjs';
import { technologyFixture } from '../../experiments/issue-56/technology-fixture.mjs';
import { cvWatchAttempt } from '../../experiments/issue-56/cv-watch-fixture.mjs';

test('derived exports and private experience preserve About only when its content was observed', async () => {
  for (const { about, observed, expected } of [
    {
      about: 'Build reliable applications.',
      observed: true,
      expected: 'Build reliable applications.',
    },
    { about: '', observed: true, expected: '' },
    { about: '', observed: false },
    { about: '', observed: undefined },
    { about: 'private@example.test', observed: true },
    { about: 'Legacy version', expected: 'Legacy version' },
  ]) {
    const raw = {
      ...resumeCvFixture(),
      about,
      ...(observed === undefined ? {} : { aboutObserved: observed }),
    };
    const { cv } = sanitizedResumeCv(raw);
    assert.deepEqual(resumeCvFromLino(resumeCvLino(cv)), cv);
    if (observed !== undefined) {
      assert.equal(cv.aboutObserved, expected !== undefined);
    }
    const fixture = await technologyFixture({ cv });
    try {
      const result = await experienceFromHhExport(fixture, fixture.input);
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const { profile } = experienceDocumentFromLino(
          experienceDocumentToLino(result.document, type),
          type
        );
        assert.equal(profile.about, expected);
        assert.equal(Object.hasOwn(profile, 'about'), expected !== undefined);
        assert.equal(Object.hasOwn(profile, 'aboutObserved'), false);
        assert.equal(
          JSON.stringify(profile).includes('private@example.test'),
          false
        );
      }
    } finally {
      await fixture.close();
    }
  }
});

test('an empty About Save requires an independently observed empty section', () => {
  const attempt = { ...cvWatchAttempt(), about: '' };
  const read = (cv) => verifyCvSave(attempt, [{ hash: attempt.hash, cv }]);
  assert.equal(read({ about: '', aboutObserved: false }), false);
  assert.equal(read({ about: '' }), false);
  assert.equal(read({}), false);
  assert.equal(read({ about: 'Existing', aboutObserved: true }), false);
  assert.equal(read({ about: '', aboutObserved: true }), true);
});
