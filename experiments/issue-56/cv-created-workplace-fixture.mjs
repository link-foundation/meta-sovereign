import { cvWorkplaceIdentityFixture } from './cv-workplace-identity-fixture.mjs';
import { cvSaveAttempt } from '../../js/src/jobs/cv-watch-verification.js';

/** Finite logical-clock Save/readback fixture; no browser, network or durable writes. */
export const cvCreatedWorkplaceFixture = ({ created = true } = {}) => {
  const f = cvWorkplaceIdentityFixture();
  const attempt = cvSaveAttempt(
    created
      ? {
          ...f.raw,
          url: 'https://hh.ru/profile/edit/experience?resumeFrom=english',
          recordId: null,
        }
      : f.raw
  );
  const state = { elapsed: 0, exports: 0, lists: 0, records: [], checks: 0 };
  const exports = f.exports.map((row, index) => ({
    ...row,
    sha256: String(index + 1).repeat(64),
    cv: {
      language: index ? 'ru' : 'en',
      title: 'Engineer',
      skills: [],
      about: '',
      ...row.cv,
    },
  }));
  const saved = {
    ...f.attempt,
    recordId: created ? '987' : f.attempt.recordId,
    sha256: 'a'.repeat(64),
  };
  const options = {
    session: {
      page: { url: () => 'https://hh.ru/resume/english' },
      commander: { evaluate: async () => null },
    },
    attempt,
    workplaceBaseline: ['123'],
    readExports: async () => {
      state.exports++;
      return exports;
    },
    readWorkplaceIds: async () => {
      state.lists++;
      return ['123', '987'];
    },
    readWorkplace: async ({ attempt }) => {
      state.records.push(attempt.recordId);
      return saved;
    },
    check: () => {
      state.checks++;
    },
    signal: new AbortController().signal,
    pollMs: 1,
    verificationMs: 100,
    clock: {
      now: () => state.elapsed,
      wait: async (ms, _value, { signal }) => {
        signal.throwIfAborted();
        state.elapsed += ms;
      },
    },
  };
  return { options, state, saved, exports };
};

export const cvWorkplaceListHtml = (ids = ['123']) =>
  `<!doctype html><main><button data-qa="list-add">Add new</button>${ids
    .map(
      (id) =>
        `<article><a data-qa="edit-experience-button-${id}" href="/profile/edit/experience/${id}">Edit</a></article>`
    )
    .join('')}</main>`;
