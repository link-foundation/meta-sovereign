import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resumeHash } from './resume-list.js';
import { jobsFailure } from './options.js';
import {
  resumeExportId,
  resumeExportResult,
  invalidResumeExport,
} from './resume-export-result.js';

const exportPointerKey = (slot, hash) => `jobs-resume-export:${slot}:${hash}`;
const checkedExportPointer = (row) => {
  const result = resumeExportResult(row);
  if (
    row.version !== 1 ||
    row.id !== exportPointerKey(result.browserSlot, result.hash)
  ) {
    invalidResumeExport();
  }
  return result;
};

export const storedResumeExport = async (store, browserSlot, hash) => {
  const id = exportPointerKey(browserSlot, hash);
  const row = await store.get(id);
  if (!row) {
    return null;
  }
  if (row.id !== id) {
    invalidResumeExport();
  }
  return checkedExportPointer(row);
};

export const storedResumeExports = async (store, browserSlot) => ({
  exports: (
    await store.query((row) =>
      row.id?.startsWith(
        browserSlot === undefined
          ? 'jobs-resume-export:'
          : exportPointerKey(browserSlot, '')
      )
    )
  )
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
    .slice(0, 100)
    .map(checkedExportPointer),
});

export const readResumeExportFile = async ({ store, artifactRoot }, input) => {
  const exportId = resumeExportId(input.exportId);
  const hash = resumeHash(input.hash);
  const row = await store.get(`jobs-resume-artifact:${exportId}:${hash}`);
  if (
    row?.version !== 1 ||
    row.id !== `jobs-resume-artifact:${exportId}:${hash}` ||
    row.exportId !== exportId ||
    row.hash !== hash
  ) {
    invalidResumeExport();
  }
  const result = resumeExportResult(row);
  const file = result.files.find((value) => value.name === input.name);
  if (!file) {
    invalidResumeExport();
  }
  const handle = await fs
    .open(path.join(artifactRoot, exportId, hash, file.name), 'r')
    .catch((error) => {
      if (error.code === 'ENOENT') {
        throw jobsFailure(
          'export-file-missing',
          'The saved export file is missing.'
        );
      }
      throw error;
    });
  const bytes = Buffer.alloc(file.size);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.size) {
      invalidResumeExport();
    }
    let offset = 0;
    while (offset < bytes.length) {
      const part = await handle.read(bytes, offset, bytes.length - offset);
      if (!part.bytesRead) {
        invalidResumeExport();
      }
      offset += part.bytesRead;
    }
    if (
      (await handle.read(Buffer.alloc(1), 0, 1)).bytesRead ||
      createHash('sha256').update(bytes).digest('hex') !== file.sha256
    ) {
      invalidResumeExport();
    }
  } finally {
    await handle.close();
  }
  return { ...file, bytes };
};
