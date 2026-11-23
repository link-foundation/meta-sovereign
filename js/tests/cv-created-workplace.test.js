import test from 'node:test';
import assert from 'node:assert/strict';
import { cvCreatedWorkplaceFixture } from '../../experiments/issue-56/cv-created-workplace-fixture.mjs';
import { verifyOwnerCvSave } from '../src/jobs/cv-save-cycle.js';
import {
  cvSaveAttempt,
  cvWorkplaceExportBaseline,
} from '../src/jobs/cv-watch-verification.js';
import {
  readCvSavedWorkplaceIds,
  createdCvWorkplaceAttempt,
} from '../src/jobs/cv-workplace-created.js';

test('owner-created Save resolves one additional native identity before verifying all final fields and CVs', async () => {
  const f = cvCreatedWorkplaceFixture();
  const result = await verifyOwnerCvSave(f.options);
  assert.deepEqual(f.state.records, ['987']);
  assert.equal(f.state.lists, 1);
  assert.equal(f.state.exports, 1);
  assert.deepEqual(result.workplaceIds, ['123', '987']);
  assert.equal(result.exports.length, 2);
  assert.equal(result.exports[0].workplace.recordId, '987');
  assert.equal(result.exports[1].workplace.checked, false);
  assert.equal(result.exports[1].cv.jobs[0].company, 'Another employer');
  assert.equal(f.options.attempt.recordId, null);
  const first = cvCreatedWorkplaceFixture();
  first.options.workplaceBaseline = [];
  first.options.readWorkplaceIds = async () => ['987'];
  assert.equal(
    (await verifyOwnerCvSave(first.options)).exports[0].workplace.recordId,
    '987'
  );
});

test('existing known workplace readback retains its exact ID without listing any new records', async () => {
  const f = cvCreatedWorkplaceFixture({ created: false });
  const result = await verifyOwnerCvSave(f.options);
  assert.deepEqual(f.state.records, ['123']);
  assert.equal(f.state.lists, 0);
  assert.equal(result.exports[0].workplace.recordId, '123');
  assert.equal(result.workplaceIds, undefined);
});

const identicalCopy = () => {
  const fixture = cvCreatedWorkplaceFixture();
  const existing = globalThis.structuredClone(fixture.exports[0].cv.jobs[0]);
  fixture.options.workplaceBaselineJobs = cvWorkplaceExportBaseline(
    fixture.exports,
    fixture.options.attempt.resumes
  );
  return { ...fixture, existing };
};

test('owner Save verifies one additional fully matching copy even if the original has identical fields', async () => {
  const f = identicalCopy();
  f.exports[0].cv.jobs.unshift(f.existing);
  const result = await verifyOwnerCvSave(f.options);
  assert.equal(result.exports[0].workplace.recordId, '987');
  assert.equal(result.exports[0].cv.jobs.length, 2);
  assert.equal(result.exports[1].workplace.checked, false);
});

test('a fresh native copy identity cannot certify an export that still shows only the identical original', async () => {
  const f = identicalCopy();
  await assert.rejects(verifyOwnerCvSave(f.options), {
    code: 'jobs-cv-mismatch',
  });
  assert.deepEqual(f.state.records, Array(5).fill('987'));
});

test('a created Save also checks the complete pre-Save export roster and unchecked CV', async () => {
  const missing = identicalCopy();
  missing.options.workplaceBaselineJobs.delete('russian');
  missing.exports[0].cv.jobs.unshift(missing.existing);
  await assert.rejects(verifyOwnerCvSave(missing.options), {
    code: 'jobs-cv-record',
  });
  assert.equal(missing.state.exports, 0);

  const extra = identicalCopy();
  extra.exports[0].cv.jobs.unshift(extra.existing);
  extra.exports[1].cv.jobs = [...extra.exports[1].cv.jobs, extra.existing];
  await assert.rejects(verifyOwnerCvSave(extra.options), {
    code: 'jobs-cv-mismatch',
  });
});

test('a matching older record, multiple additions and a disappearing baseline record never verify a new Save', async () => {
  for (const ids of [['123'], ['123', '987', '988'], ['987']]) {
    const f = cvCreatedWorkplaceFixture();
    f.options.readWorkplaceIds = async () => {
      f.state.lists++;
      return ids;
    };
    await assert.rejects(verifyOwnerCvSave(f.options), {
      code: 'jobs-cv-record',
    });
    assert.equal(f.state.lists, 5);
    assert.deepEqual(f.state.records, []);
  }
});

test('a new Save without a complete pre-Save baseline refuses before any saved content reads', async () => {
  for (const baseline of [undefined, null, ['123', '123'], [123]]) {
    const f = cvCreatedWorkplaceFixture();
    f.options.workplaceBaseline = baseline;
    await assert.rejects(verifyOwnerCvSave(f.options), {
      code: 'jobs-cv-record',
    });
    assert.equal(f.state.exports, 0);
    assert.equal(f.state.lists, 0);
  }
});

test('new identity readback preserves every field, membership and exported metadata guard', async () => {
  for (const patch of [
    { recordId: '988' },
    { company: 'Other employer' },
    { description: 'Older description' },
    { start: '2019-01' },
    { website: 'different.test' },
    { area: 'Other city' },
    { industryText: 'Other industry' },
    {
      resumes: [
        { hash: 'english', checked: true },
        { hash: 'russian', checked: true },
      ],
    },
  ]) {
    const f = cvCreatedWorkplaceFixture();
    Object.assign(f.saved, patch);
    await assert.rejects(verifyOwnerCvSave(f.options), {
      code: 'jobs-cv-mismatch',
    });
    assert.equal(f.state.records.length, 5);
  }
  const f = cvCreatedWorkplaceFixture();
  f.exports[0].cv.jobs[0].description = 'Old export';
  await assert.rejects(verifyOwnerCvSave(f.options), {
    code: 'jobs-cv-mismatch',
  });
});

test('native new-record listing retries transient failures without repeating a Save', async () => {
  const f = cvCreatedWorkplaceFixture();
  const read = f.options.readWorkplaceIds;
  let calls = 0;
  f.options.readWorkplaceIds = async (input) => {
    if (++calls === 1) {
      throw new Error('Transient native list read');
    }
    return read(input);
  };
  const result = await verifyOwnerCvSave(f.options);
  assert.equal(calls, 2);
  assert.deepEqual(f.state.records, ['987']);
  assert.equal(result.exports[0].workplace.recordId, '987');
});

test('Stop or owner changes during new-identity reads invalidate the result before exact record readback', async () => {
  const f = cvCreatedWorkplaceFixture();
  let changed = false;
  f.options.check = () => {
    if (changed) {
      throw Object.assign(new Error('Owner changed'), {
        code: 'jobs-cv-changed',
      });
    }
  };
  f.options.readWorkplaceIds = async () => {
    changed = true;
    return ['123', '987'];
  };
  await assert.rejects(verifyOwnerCvSave(f.options), {
    code: 'jobs-cv-changed',
  });
  assert.deepEqual(f.state.records, []);
});

test('an About Save never resolves workplace identity or changes its final text verification', async () => {
  const f = cvCreatedWorkplaceFixture();
  f.options.attempt = { kind: 'about', hash: 'english', about: '' };
  const result = await verifyOwnerCvSave(f.options);
  assert.equal(result.exports.length, 2);
  assert.equal(f.state.lists, 0);
  assert.deepEqual(f.state.records, []);
});

test('inert list responses remain size-bounded and reject malformed native identities', async () => {
  for (const value of [null, 'html', ['123', '123'], ['bad'], [123]]) {
    let calls = 0;
    await assert.rejects(
      readCvSavedWorkplaceIds({
        check: () => {},
        session: {
          commander: {
            evaluate: async () => (++calls === 1 ? '<main></main>' : value),
          },
        },
      }),
      { code: 'jobs-cv-record' }
    );
  }
  let calls = 0;
  await assert.rejects(
    readCvSavedWorkplaceIds({
      check: () => {},
      session: {
        commander: {
          evaluate: async () => {
            calls++;
            return 'x'.repeat(2 * 1024 ** 2 + 1);
          },
        },
      },
    }),
    { code: 'jobs-cv-record' }
  );
  assert.equal(calls, 1);
});

test('new workplace capture accepts only the native creation path and a null identity', () => {
  const f = cvCreatedWorkplaceFixture();
  for (const url of [
    'https://hh.ru/resume/english',
    'https://hh.ru/profile/edit/experience/987',
  ]) {
    const raw = {
      ...f.options.attempt,
      url,
      start: 'January 2020',
      end: 'May 2024',
    };
    assert.throws(() => cvSaveAttempt(raw));
  }
  assert.throws(() =>
    createdCvWorkplaceAttempt(
      { ...f.options.attempt, recordId: '123' },
      ['123'],
      ['123', '987']
    )
  );
});
