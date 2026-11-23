import test from 'node:test';
import assert from 'node:assert/strict';
import { cvWorkplaceIdentityFixture } from '../../experiments/issue-56/cv-workplace-identity-fixture.mjs';
import {
  cvWorkplaceMembershipBaseline,
  verifyCvSave,
} from '../src/jobs/cv-watch-verification.js';

const sharedCopy = () => {
  const { attempt, job } = cvWorkplaceIdentityFixture();
  const retained = { ...job, company: 'Unrelated employer' };
  const originals = [
    {
      hash: 'english',
      cv: { jobs: [job, job, retained] },
      industryEntries: job.industries,
    },
    {
      hash: 'russian',
      cv: { jobs: [job, retained] },
      industryEntries: job.industries,
    },
  ];
  const before = {
    ...attempt,
    resumes: attempt.resumes.map((row) => ({ ...row, checked: true })),
  };
  const final = {
    ...before,
    resumes: before.resumes.map((row) => ({
      ...row,
      checked: row.hash !== 'english',
    })),
  };
  const verify = (
    exports,
    saved = final,
    baseline = cvWorkplaceMembershipBaseline(before, originals)
  ) => verifyCvSave(final, exports, saved, undefined, baseline);
  const fresh = [
    { ...originals[0], cv: { jobs: [retained, job] } },
    originals[1],
  ];
  return { verify, originals, fresh, job, final, before };
};

test('detach receipt requires exact saved membership and one removed duplicate in a fresh export', () => {
  const { verify, originals, fresh, before } = sharedCopy();
  assert.equal(verify(fresh), true);
  assert.equal(
    verify(originals),
    false,
    'A stale export must not become a verified snapshot'
  );
  assert.equal(
    verify(fresh, before),
    false,
    'The provider must confirm the exact membership'
  );
});

test('detach receipt preserves the copy and unrelated work in both CV exports', () => {
  const { verify, fresh, job } = sharedCopy();
  for (const [index, jobs] of [
    [0, [job, job]],
    [0, fresh[0].cv.jobs.slice(0, 1)],
    [1, [job]],
    [1, [...fresh[1].cv.jobs, job]],
  ]) {
    const exports = fresh.map((row, i) =>
      i === index ? { ...row, cv: { jobs } } : row
    );
    assert.equal(verify(exports), false);
  }
});

test('detach Save verifies final owner edits on the CV that keeps the original record', () => {
  const { final, before, originals, fresh } = sharedCopy();
  const description = 'Final owner wording';
  const edited = { ...final, description };
  const exports = [
    fresh[0],
    {
      ...fresh[1],
      cv: {
        jobs: [{ ...fresh[1].cv.jobs[0], description }, fresh[1].cv.jobs[1]],
      },
    },
  ];
  const baseline = cvWorkplaceMembershipBaseline(before, originals);
  assert.equal(
    verifyCvSave(edited, exports, edited, undefined, baseline),
    true
  );
  assert.equal(verifyCvSave(edited, fresh, edited, undefined, baseline), false);
});

test('detach receipt requires prior exact membership and a confirmed matching original in the export', () => {
  const { verify, fresh, before, originals, final } = sharedCopy();
  const missing = cvWorkplaceMembershipBaseline(before, [
    { ...originals[0], cv: { jobs: [] } },
    originals[1],
  ]);
  assert.throws(() => verify(fresh, final, missing), {
    code: 'jobs-cv-record',
  });
});
