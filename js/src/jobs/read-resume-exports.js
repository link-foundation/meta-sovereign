import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readAssignmentPage } from '../assignments/read-page.js';
import {
  writeFileDurable,
  ensurePrivateDir,
  fsyncDir,
} from '../storage/durable.js';
import {
  HH_RESUMES_URL,
  resumeList,
  chooseSearchResume,
} from './resume-list.js';
import { readResumeListDocument } from './read-resumes.js';
import { createResumeDownloadSink } from './resume-download.js';
import { readResumeExportHtml } from './resume-export-dom.js';
import { resumePeriod } from './resume-dates.js';
import { sanitizedResumeCv, resumeCvLino, resumeCvText } from './resume-cv.js';
import { loadResumeIndustries, resolveResumeIndustry } from './industries.js';
import {
  RESUME_DERIVED_FORMATS,
  resumeExportResult,
} from './resume-export-result.js';
import { jobsFailure } from './options.js';

const derivedFiles = (cv) => ({
  markdown: resumeCvText(cv, true),
  text: resumeCvText(cv),
  structured: `${JSON.stringify(cv, null, 2)}\n`,
  lino: resumeCvLino(cv),
});
const extractCv = async ({
  session,
  folder,
  store,
  options,
  check,
  fetchIndustries,
}) => {
  const html = await fs.readFile(path.join(folder, 'resume.html'), 'utf8');
  const raw = await session.commander.evaluate({
    fn: readResumeExportHtml,
    args: [{ html }],
  });
  check();
  if (raw?.observed !== true) {
    throw jobsFailure(
      'resume-content',
      'Native resume export labels were not confirmed. Check the owned browser for login or verification.'
    );
  }
  const industries = raw.jobs.some((job) => job.industries.length)
    ? await fetchIndustries({
        store,
        language: raw.language,
        signal: options.signal,
      })
    : [];
  const result = sanitizedResumeCv({
    ...raw,
    jobs: raw.jobs.map((job) => ({
      ...job,
      ...resumePeriod(job.period),
      industries: job.industries.map((industry) =>
        resolveResumeIndustry(industry, industries)
      ),
    })),
  });
  if (Buffer.byteLength(JSON.stringify(result.cv)) > 256 * 1024) {
    throw jobsFailure('resume-size', 'The structured resume exceeds 256 KiB.');
  }
  return result;
};

const exportResume = async ({
  entry,
  artifactRoot,
  exportId,
  session,
  check,
  options,
  store,
  fetchIndustries,
}) => {
  check();
  const folder = path.join(artifactRoot, exportId, entry.hash);
  await ensurePrivateDir(folder);
  let published = false;
  try {
    const navigation = await session.commander.goto({
      url: entry.url,
      waitUntil: 'domcontentloaded',
      timeout: 30000,
      signal: options.signal,
    });
    check();
    if (
      navigation?.verified !== true ||
      navigation.navigated !== true ||
      navigation.status !== 'ready' ||
      session.page.url() !== entry.url
    ) {
      throw jobsFailure(
        'resume-page',
        'The requested owned resume page did not load.'
      );
    }
    const download = await createResumeDownloadSink({ session, folder, check });
    const files = [await download(entry.hash, 'html')];
    const { cv, sanitization } = await extractCv({
      session,
      folder,
      store,
      options,
      check,
      fetchIndustries,
    });
    for (const format of options.formats.filter(
      (format) => format !== 'html'
    )) {
      check();
      files.push(await download(entry.hash, format));
    }
    for (const [format, content] of Object.entries(derivedFiles(cv))) {
      check();
      const spec = RESUME_DERIVED_FORMATS[format];
      await writeFileDurable(path.join(folder, spec.name), content);
      files.push({
        ...spec,
        size: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
        native: false,
      });
    }
    await fsyncDir(folder);
    check();
    const result = resumeExportResult({
      exportId,
      hash: entry.hash,
      browserSlot: options.browserSlot,
      title: cv.title,
      language: cv.language,
      languageEvidence: 'native-export',
      capturedAt: new Date().toISOString(),
      updatedAt: entry.updatedAt,
      files,
      sanitization,
    });
    await store.put({
      id: `jobs-resume-artifact:${exportId}:${entry.hash}`,
      version: 1,
      ...result,
    });
    await store.flush?.();
    published = true;
    await store.put({
      id: `jobs-resume-export:${options.browserSlot}:${entry.hash}`,
      version: 1,
      ...result,
    });
    await store.flush?.();
    return result;
  } finally {
    if (!published) {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
};

/** One owned page, finite per-download waits and acknowledged shutdown. */
export const createResumeExportReader =
  ({
    store,
    openSession,
    artifactRoot,
    fetchIndustries = loadResumeIndustries,
  }) =>
  (options, progress) =>
    readAssignmentPage({
      store,
      openSession,
      signal: options.signal,
      platform: 'hh',
      slot: options.browserSlot,
      useCase: 'jobs',
      kind: 'resume-export',
      url: HH_RESUMES_URL,
      browserOptions:
        options.headless === undefined ? {} : { headless: options.headless },
      deadlineMs: 30 * 60000,
      validate: (value) => value,
      execute: async (session, check) => {
        const list = resumeList(
          await session.commander.evaluate({
            fn: readResumeListDocument,
            args: [],
          }),
          options.browserSlot
        );
        const choice = chooseSearchResume(list, {
          ...(options.resume ? { resume: options.resume } : {}),
          resumeLanguage: 'any',
        });
        const entries = options.all
          ? list.entries
          : list.entries.filter((entry) => entry.hash === choice.hash);
        if (!entries.length) {
          throw jobsFailure(
            'resume-missing',
            'No requested resumes were confirmed in this account.'
          );
        }
        await progress({ total: entries.length });
        const exportId = randomUUID();
        const results = [];
        for (const entry of entries) {
          const result = await exportResume({
            entry,
            artifactRoot,
            exportId,
            session,
            check,
            options,
            store,
            fetchIndustries,
          });
          results.push(result);
          await progress({ result });
        }
        return { results, list };
      },
    });
