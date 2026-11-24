import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAllCvs } from '../src/cv/index.js';
import {
  compareExperience,
  experienceCompanyKey,
} from '../src/cv/experience.js';
import { formatExperienceComparison } from '../src/cv/experience-report.js';
import { experienceEntries } from '../../experiments/issue-56/experience-fixture.mjs';

const compare = () => {
  const [hh, linkedin] = experienceEntries();
  return compareExperience(hh.cv.experience, linkedin.cv.experience, {
    asOf: '2026-11',
  });
};
test('company/time comparison pairs translated roles and retains original metadata', () => {
  const result = compare();
  assert.equal(result.pairs.length, 1);
  const pair = result.pairs[0];
  assert.equal(
    experienceCompanyKey(pair.left.company),
    experienceCompanyKey(pair.right.company)
  );
  assert.deepEqual(
    pair.differences.map((item) => item.field),
    ['company', 'description', 'end', 'location', 'native', 'start', 'title']
  );
  assert.equal(pair.left.native.recordId, 'hh-job-1');
  assert.equal(pair.right.native.media[0].url, 'https://example.test');
  assert.ok(
    pair.differences.find((item) => item.field === 'title').requiresTranslation
  );
  assert.equal(pair.left.industries[0].name, 'Информационные технологии');
  assert.equal(pair.right.industries[0].name, 'Information technology');
  assert.deepEqual(
    result.onlyLeft.map((item) => item.job.company),
    ['Only HH']
  );
  assert.deepEqual(
    result.onlyRight.map((item) => item.job.company),
    ['Only LinkedIn']
  );
  assert.equal(
    result.review.filter((item) => item.reason === 'ambiguous').length,
    3
  );
  assert.equal(
    result.review.filter((item) => item.reason === 'unknown-period').length,
    2
  );
});
test('facade exposes company/time comparison alongside its unchanged generic matrix', () => {
  const result = compareAllCvs(experienceEntries(), {
    experience: { asOf: '2026-11' },
  });
  assert.equal(result.experience?.status, 'compared');
  assert.equal(result.experience.pairs[0].right.title, 'Software engineer');
  assert.ok(result.rows.some((row) => row.path.includes('разработчик')));
  assert.ok(result.updates.hh);
});
test('nonoverlapping jobs and explicitly aliased employers remain distinct decisions', () => {
  const left = [{ company: 'Acme', title: 'A', start: '2020', end: '2021' }];
  const right = [
    { company: 'Acme', title: 'B', start: '2022-01', end: '2023' },
  ];
  assert.equal(compareExperience(left, right).pairs.length, 0);
  assert.equal(compareExperience(left, right).onlyRight.length, 1);
  right[0] = {
    company: 'New name',
    title: 'B',
    start: '2021-12',
    current: true,
  };
  const options = { asOf: '2026-11', companyAliases: [['Acme', 'New name']] };
  assert.equal(compareExperience(left, right, options).pairs.length, 1);
  assert.equal(compareExperience(left, right).pairs.length, 0);
  assert.throws(
    () =>
      compareExperience(left, right, {
        companyAliases: [
          ['Acme', 'New name'],
          ['Acme', 'Other'],
        ],
      }),
    { code: 'cv-experience-input' }
  );
});
test('comparison is detached from input and Markdown includes every review record', () => {
  const entries = experienceEntries();
  const before = globalThis.structuredClone(entries);
  const result = compareExperience(
    entries[0].cv.experience,
    entries[1].cv.experience
  );
  result.pairs[0].left.native.recordId = 'changed copy';
  assert.deepEqual(entries, before);
  const report = formatExperienceComparison(compare());
  for (const text of [
    'HH only',
    'LinkedIn only',
    'unknown-period',
    'ambiguous',
    'hh-job-1',
    'linkedin-job-1',
    'requiresTranslation',
    'no provider changes',
  ]) {
    assert.ok(report.includes(text), text);
  }
});
test('an undated competing role prevents a seemingly unique pair from being guessed', () => {
  const job = { company: 'Acme', start: '2020-01', end: '2022-12' };
  const result = compareExperience([job, { company: 'Acme' }], [job]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.onlyLeft.length, 0);
  assert.equal(result.onlyRight.length, 0);
  assert.equal(result.review.length, 3);
  assert.equal(
    result.review.find((item) => item.side === 'linkedin').reason,
    'unknown-period'
  );
  assert.equal(
    compareExperience([{ company: 'Undated only' }], []).review[0].reason,
    'unknown-period'
  );
});
test('malformed, oversized and accessor data cannot produce a guessed match', () => {
  const job = { company: 'Acme', start: '2020-01', end: '2022-12' };
  for (const input of [
    [{ ...job, start: 'yesterday' }],
    [{ ...job, current: true }],
    [{ ...job, start: '2023' }],
    Array(201).fill(job),
    [{ ...job, description: 'x'.repeat(24001) }],
  ]) {
    assert.throws(() => compareExperience(input, []), {
      code: 'cv-experience-input',
    });
  }
  let reads = 0;
  const accessor = [];
  Object.defineProperty(accessor, '0', {
    get() {
      reads++;
      return job;
    },
  });
  assert.throws(() => compareExperience(accessor, []), {
    code: 'cv-experience-input',
  });
  assert.equal(reads, 0);
  const legacy = compareAllCvs([
    { platform: 'hh', cv: { experience: [{ ...job, start: 'Jan 2020' }] } },
    { platform: 'linkedin', cv: { experience: [job] } },
  ]);
  assert.equal(legacy.experience.status, 'unavailable');
  assert.ok(legacy.rows.length > 0);
  assert.equal(compareAllCvs([{ platform: 'hh', cv: {} }]).experience, null);
});
