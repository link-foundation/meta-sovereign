import {
  resumeExportResult,
  invalidResumeExport,
} from './resume-export-result.js';
import { resumeLanguageProof } from './resume-language.js';
import { verifiedTechnologyCv } from './technology-cv.js';

const matchesList = (receipt, entry) =>
  receipt.title === entry.title &&
  entry.updatedAt !== null &&
  receipt.updatedAt === entry.updatedAt &&
  Date.parse(receipt.capturedAt) >= entry.updatedAt;

const checkedProof = async (context, receipt, entry) => {
  try {
    const artifact = resumeExportResult(
      await context.store.get(
        `jobs-resume-artifact:${receipt.exportId}:${receipt.hash}`
      )
    );
    if (JSON.stringify(artifact) !== JSON.stringify(receipt)) {
      invalidResumeExport();
    }
    const { identity } = await verifiedTechnologyCv(context, receipt);
    if (
      identity.language !== receipt.language ||
      identity.title !== receipt.title ||
      identity.capturedAt !== receipt.capturedAt ||
      identity.sha256 !==
        receipt.files.find((file) => file.name === 'resume.json').sha256
    ) {
      invalidResumeExport();
    }
    return resumeLanguageProof(
      { ...identity, updatedAt: receipt.updatedAt },
      entry
    );
  } catch {
    // Missing files and parsing failures must not expose private filesystem paths.
    invalidResumeExport();
  }
};

/** Recheck one bounded file at a time. No artifact content enters the list cache. */
export const withResumeLanguages = async (context, list, signal) => {
  const entries = [];
  for (const entry of list.entries) {
    signal?.throwIfAborted();
    const id = `jobs-resume-export:${list.browserSlot}:${entry.hash}`;
    const raw = await context.store.get(id);
    let languageProof;
    if (raw) {
      const receipt = resumeExportResult(raw);
      if (
        raw.version !== 1 ||
        raw.id !== id ||
        receipt.browserSlot !== list.browserSlot ||
        receipt.hash !== entry.hash
      ) {
        invalidResumeExport();
      }
      if (matchesList(receipt, entry)) {
        languageProof = await checkedProof(context, receipt, entry);
      }
    }
    signal?.throwIfAborted();
    entries.push({ ...entry, ...(languageProof ? { languageProof } : {}) });
  }
  return { ...list, entries };
};
