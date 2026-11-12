import { createHash } from 'node:crypto';
import { readResumeExportHtml } from './resume-export-dom.js';
import { loadResumeIndustries, resolveResumeIndustry } from './industries.js';
import { resumePeriod } from './resume-dates.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { jobsFailure } from './options.js';

/** Native GET only, in the current page's authenticated origin. No navigation. */
export const fetchCvSavedHtml = async ({ hash, recordId }) => {
  const { location, AbortSignal } = globalThis;
  if (location.origin !== 'https://hh.ru') {
    throw new Error('The native CV page changed.');
  }
  const workplace = typeof recordId === 'string';
  if (
    workplace
      ? !/^\d{1,100}$/u.test(recordId)
      : !/^[a-zA-Z\d_-]{1,100}$/u.test(hash ?? '')
  ) {
    throw new Error('The native saved CV identity is unavailable.');
  }
  const url = new URL(
    workplace
      ? `/profile/edit/experience/${recordId}`
      : '/resume_converter/resume.txt',
    location.origin
  );
  if (!workplace) {
    url.searchParams.set('hash', hash);
    url.searchParams.set('type', 'txt');
  }
  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { 'cache-control': 'no-cache' },
  });
  const limit = 2 * 1024 ** 2;
  if (
    !response.ok ||
    response.url !== url.href ||
    !response.body ||
    Number(response.headers.get('content-length')) > limit
  ) {
    throw new Error('Native saved CV readback is unavailable.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let html = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) {
        break;
      }
      size += part.value.byteLength;
      if (size > limit) {
        throw new Error('The native saved CV exceeds its bound.');
      }
      html += decoder.decode(part.value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

export const readCvSavedExports = async ({
  session,
  store,
  attempt,
  check,
  signal,
}) => {
  const hashes =
    attempt.kind === 'about'
      ? [attempt.hash]
      : attempt.resumes.map((row) => row.hash);
  const exports = [];
  const industryEntries =
    attempt.kind === 'workplace' && attempt.industryText
      ? await loadResumeIndustries({ store, language: attempt.locale, signal })
      : [];
  let total = 0;
  for (const hash of hashes) {
    check();
    cvWatchUrl(session.page.url());
    const html = await session.commander.evaluate({
      fn: fetchCvSavedHtml,
      args: [{ hash }],
    });
    check();
    if (typeof html !== 'string' || Buffer.byteLength(html) > 2 * 1024 ** 2) {
      throw jobsFailure(
        'cv-readback',
        'The native saved CV was not confirmed.'
      );
    }
    const raw = await session.commander.evaluate({
      fn: readResumeExportHtml,
      args: [{ html }],
    });
    check();
    if (raw?.observed !== true) {
      throw jobsFailure(
        'cv-readback',
        'Native saved CV labels were not confirmed.'
      );
    }
    const entries = raw.jobs.some((job) => job.industries.length)
      ? await loadResumeIndustries({ store, language: raw.language, signal })
      : [];
    check();
    const cv = {
      ...raw,
      jobs: raw.jobs.map((job) => ({
        ...job,
        ...resumePeriod(job.period),
        industries: job.industries.map((industry) =>
          resolveResumeIndustry(industry, entries)
        ),
      })),
    };
    const sanitized = sanitizedResumeCv(cv);
    total += JSON.stringify(cv).length;
    if (total > 8 * 1024 ** 2) {
      throw jobsFailure(
        'cv-limit',
        'Saved CV readback exceeded its aggregate bound.'
      );
    }
    exports.push({
      hash,
      cv,
      sanitized: sanitized.cv,
      sanitization: sanitized.sanitization,
      sha256: createHash('sha256').update(html).digest('hex'),
      industryEntries,
    });
  }
  return exports;
};
