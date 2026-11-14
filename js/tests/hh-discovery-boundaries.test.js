import test from 'node:test';
import assert from 'node:assert/strict';
import { hhDiscoveryDocument } from './helpers/hh-discovery-document.mjs';
import { readResumeListDocument } from '../src/jobs/read-resumes.js';
import { readVacancySearchDocument } from '../src/jobs/read-search.js';
import { readAssignmentVacancyDocument } from '../src/assignments/vacancy-reader.js';

for (const reader of [
  readResumeListDocument,
  readVacancySearchDocument,
  readAssignmentVacancyDocument,
]) {
  for (const marker of [
    'input[data-qa="account-captcha-input"]',
    'input[name="captchaText"]',
    '.smart-captcha',
    '[data-qa="captcha"]',
  ]) {
    for (const visible of [true, false]) {
      test(`${reader.name}, ${marker}, visible ${visible}: verification precedes discovery payload`, () => {
        const { result, queries } = hhDiscoveryDocument(
          reader,
          marker,
          visible
        );
        assert.equal(result.challenge, visible);
        if (visible) {
          assert.deepEqual(queries, []);
          assert.equal(result.title ?? '', '');
          assert.equal(result.description ?? '', '');
          assert.equal(result.entries?.length ?? 0, 0);
          assert.equal(result.cards?.length ?? 0, 0);
          assert.notEqual(result.observed, true);
          assert.notEqual(result.empty, true);
          assert.equal(result.next ?? null, null);
        } else {
          assert(queries.length > 0);
        }
      });
    }
  }
}
