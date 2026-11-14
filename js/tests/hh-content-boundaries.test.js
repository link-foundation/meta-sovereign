import test from 'node:test';
import assert from 'node:assert/strict';
import { hhContentDocument } from './helpers/hh-content-document.mjs';
import { readAssignmentSourceDocument } from '../src/assignments/source-document.js';
import { readCvAboutPreparation } from '../src/jobs/cv-prepare-document.js';
import { readCvEditorDocument } from '../src/jobs/cv-watch-document.js';
import {
  cvWorkplaceSelectors,
  readCvWorkplaceControls,
} from '../src/jobs/cv-workplace-controls.js';
import { prepareNativeCvWorkplace } from '../src/jobs/cv-prepare-workplace.js';

for (const marker of [
  'input[data-qa="account-captcha-input"]',
  'input[name="captchaText"]',
]) {
  for (const [reader, input] of [
    [readAssignmentSourceDocument],
    [readCvAboutPreparation],
    [readCvWorkplaceControls, cvWorkplaceSelectors],
    [readCvEditorDocument],
    [
      readCvEditorDocument,
      {
        html: '<html>saved record</html>',
        url: 'https://hh.ru/profile/edit/experience/123',
      },
    ],
  ]) {
    for (const visible of [true, false]) {
      test(`${reader.name}, saved ${Boolean(input?.html)}, ${marker}, visible ${visible}: no content before verification`, () => {
        const fixture = hhContentDocument(marker, visible);
        const result = fixture.evaluate(reader, input);
        if (visible) {
          assert(result?.challenge || result?.blocked);
          assert.deepEqual(fixture.queries, []);
          assert.equal(result.title ?? '', '');
          assert.equal(result.text ?? '', '');
          assert.equal(result.about ?? null, null);
          assert.equal(result.fields ?? null, null);
          assert.notEqual(result.complete, true);
          assert.notEqual(result.writable, true);
        } else {
          assert(!result?.challenge && !result?.blocked);
          assert(fixture.queries.length > 0);
        }
      });
    }
  }
  test(`workplace description recheck, ${marker}: a late gate stops before controlled values`, async () => {
    const fixture = hhContentDocument(marker, true);
    let reads = 0;
    await assert.rejects(
      prepareNativeCvWorkplace({
        session: {
          page: { url: () => 'https://hh.ru/profile/edit/experience/123' },
          commander: {
            evaluate: ({ fn, args }) => {
              reads++;
              // Simulate a gate appearing between the two native reads.
              return fn === readCvEditorDocument
                ? { kind: 'workplace' }
                : fixture.evaluate(fn, args[0]);
            },
          },
        },
        change: { workplace: { recordId: '123' } },
        check: () => {},
      }),
      { code: 'jobs-cv-draft' }
    );
    assert.equal(reads, 2);
    assert.deepEqual(fixture.queries, []);
  });
}
