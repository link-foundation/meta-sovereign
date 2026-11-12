import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  storedTechnologyCatalog,
  technologyFailure,
} from './technology-catalog.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { verifiedTechnologyCv } from './technology-cv.js';
import { confirmedTechnologyAnalysis } from './technology-result.js';
import { buildCvTechnologyReview } from './cv-technology-review.js';
import {
  confirmedCvTechnologyReview,
  fingerprintTechnologyReview,
} from './cv-technology-result.js';
import { saveTechnologyRecord } from './technology-storage.js';

const storedReview = async (store, input) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const row = await store.get(`jobs-cv-technology-review:${browserSlot}`);
  if (!row) {
    return { review: null };
  }
  if (row.version !== 1) {
    throw technologyFailure('cache');
  }
  return confirmedCvTechnologyReview({ review: row.review }, { browserSlot });
};
const observedSpellings = async (store, browserSlot, revision) => {
  const row = await store.get(`jobs-technology-analysis:${browserSlot}`);
  if (!row) {
    return [];
  }
  const { analysis } = await confirmedTechnologyAnalysis({
    analysis: row.analysis,
  });
  if (
    analysis.resume.browserSlot !== browserSlot ||
    analysis.catalogRevision !== revision
  ) {
    throw technologyFailure('conflict');
  }
  const observed = analysis.statistics.flatMap((term) =>
    term.spellings.map((item) => ({
      canonical: term.canonical,
      spelling: item.value,
    }))
  );
  if (observed.length > 2048) {
    throw technologyFailure('limit');
  }
  return observed;
};
const currentSources = async (options, input) => {
  if (!Array.isArray(input.exports) || input.exports.length !== 2) {
    throw technologyFailure('resume');
  }
  const sources = [];
  for (const selected of input.exports) {
    const source = await verifiedTechnologyCv(options, {
      ...selected,
      browserSlot: input.browserSlot,
    });
    sources.push({ ...source, cv: sanitizedResumeCv(source.cv).cv });
  }
  if (
    sources[0].identity.hash === sources[1].identity.hash ||
    new Set(sources.map((source) => source.cv.language)).size !== 2 ||
    JSON.stringify(sources).length > 4 * 1024 * 1024
  ) {
    throw technologyFailure('resume');
  }
  return sources;
};
export const createCvTechnologyService = ({
  store,
  artifactRoot,
  write,
  read,
}) => {
  const save = async (review) => {
    await confirmedCvTechnologyReview({ review });
    await saveTechnologyRecord(store, {
      id: `jobs-cv-technology-review:${review.sources[0].identity.browserSlot}`,
      version: 1,
      review,
    });
    return { review };
  };
  return {
    'technology-review-stored': (input) =>
      read(() => storedReview(store, input)),
    'technology-review': (input) =>
      write(async (signal) => {
        const browserSlot = browserName(input.browserSlot ?? 'jobs');
        const catalog = await storedTechnologyCatalog(store);
        if (input.revision !== catalog.revision) {
          throw technologyFailure('conflict');
        }
        const sources = await currentSources(
          { store, artifactRoot },
          { ...input, browserSlot }
        );
        const observed = await observedSpellings(
          store,
          browserSlot,
          catalog.revision
        );
        const report = buildCvTechnologyReview({ sources, catalog, observed });
        signal.throwIfAborted();
        return save(
          await fingerprintTechnologyReview({
            sources,
            catalog,
            observed,
            report,
            status: 'draft',
            selected: [],
            createdAt: new Date().toISOString(),
          })
        );
      }),
    'technology-review-save': (input) =>
      write(async (signal) => {
        const browserSlot = browserName(input.browserSlot ?? 'jobs');
        const { review } = await storedReview(store, { browserSlot });
        const catalog = await storedTechnologyCatalog(store);
        if (
          !review ||
          review.fingerprint !== input.fingerprint ||
          catalog.revision !== review.catalog.revision ||
          !Array.isArray(input.selected) ||
          !input.selected.length ||
          review.report.blockers.length
        ) {
          throw technologyFailure('conflict');
        }
        const sources = await currentSources(
          { store, artifactRoot },
          {
            browserSlot,
            exports: review.sources.map((source) => source.identity),
          }
        );
        if (
          (await modelFingerprint(sources)) !==
          (await modelFingerprint(review.sources))
        ) {
          throw technologyFailure('conflict');
        }
        const { fingerprint: _old, ...content } = review;
        const next = await fingerprintTechnologyReview({
          ...content,
          selected: input.selected,
          previousFingerprint: review.fingerprint,
          status: 'reviewed',
          reviewedAt: new Date().toISOString(),
        });
        await confirmedCvTechnologyReview(
          { review: next },
          { ...input, revision: catalog.revision }
        );
        signal.throwIfAborted();
        return save(next);
      }),
  };
};
