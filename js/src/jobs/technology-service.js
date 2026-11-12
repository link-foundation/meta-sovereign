import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { vacancyContent } from '../assignments/vacancy-content.js';
import { resumeExportResult } from './resume-export-result.js';
import { readResumeExportFile } from './resume-export-files.js';
import {
  storedTechnologyCatalog,
  saveTechnologyCatalog,
  technologyFailure,
} from './technology-catalog.js';
import { jobsFailure } from './options.js';
import { analyzeTechnologies } from './technology-analysis.js';
import { confirmedTechnologyAnalysis } from './technology-result.js';

const pending = new WeakMap();
const acknowledgedWrite = (store, run, operation) => {
  const task = run(operation);
  if (pending.has(store)) {
    return task;
  }
  const acknowledged = task.finally(() => {
    if (pending.get(store) === acknowledged) {
      pending.delete(store);
    }
  });
  pending.set(store, acknowledged);
  return acknowledged;
};
const acknowledgedRead = async (store, read) => {
  await pending.get(store)?.catch(() => {});
  return read();
};

export const storedVacancies = async (store) => {
  const rows = await store.query(
    (row) => row.id?.startsWith('assignment-vacancy:') && row.version === 1
  );
  const entries = [];
  for (const row of rows
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
    .slice(0, 100)) {
    const content = vacancyContent(row);
    if (
      row.id !== `assignment-vacancy:${await modelFingerprint(content.url)}`
    ) {
      throw jobsFailure(
        'cache-invalid',
        'A saved vacancy has an invalid identity.'
      );
    }
    entries.push({ id: row.id, ...content });
  }
  return { entries };
};

const storedAnalysis = async (store, input) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const row = await store.get(`jobs-technology-analysis:${browserSlot}`);
  if (!row) {
    return { analysis: null };
  }
  const { fingerprint, capturedAt, ...content } = row.analysis ?? {};
  if (
    row.version !== 1 ||
    content.resume?.browserSlot !== browserSlot ||
    !Number.isFinite(Date.parse(capturedAt)) ||
    fingerprint !== (await modelFingerprint(content))
  ) {
    throw technologyFailure('cache');
  }
  return confirmedTechnologyAnalysis({ analysis: row.analysis });
};

export const createTechnologyService = ({ store, artifactRoot, run }) => ({
  'technology-catalog': () =>
    acknowledgedRead(store, () => storedTechnologyCatalog(store)),
  'technology-catalog-save': (input) =>
    acknowledgedWrite(store, run, () => saveTechnologyCatalog(store, input)),
  'technology-analysis-stored': (input) =>
    acknowledgedRead(store, () => storedAnalysis(store, input)),
  'technology-analyze': (input) =>
    acknowledgedWrite(store, run, async (signal) => {
      const browserSlot = browserName(input.browserSlot ?? 'jobs');
      const file = await readResumeExportFile(
        { store, artifactRoot },
        { ...input, name: 'resume.json' }
      );
      const row = await store.get(
        `jobs-resume-artifact:${input.exportId}:${input.hash}`
      );
      const receipt = resumeExportResult(row);
      const catalog = await storedTechnologyCatalog(store);
      if (
        receipt.browserSlot !== browserSlot ||
        input.revision !== catalog.revision
      ) {
        throw technologyFailure('conflict');
      }
      const cv = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
      );
      if (cv.language !== receipt.language || cv.title !== receipt.title) {
        throw technologyFailure('resume');
      }
      const analysis = await analyzeTechnologies({
        catalog,
        vacancies: (await storedVacancies(store)).entries,
        cv,
        signal,
        resume: {
          exportId: receipt.exportId,
          hash: receipt.hash,
          browserSlot,
          title: receipt.title,
          language: receipt.language,
          capturedAt: receipt.capturedAt,
          sha256: file.sha256,
        },
      });
      signal.throwIfAborted();
      const id = `jobs-technology-analysis:${browserSlot}`;
      const previous = await store.get(id);
      await store.put({ id, version: 1, analysis });
      try {
        await store.flush?.();
      } catch (error) {
        if (previous) {
          await store.put(previous);
        } else {
          await store.delete(id);
        }
        throw error;
      }
      return { analysis };
    }),
});
