import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resumeHash } from './resume-list.js';
import {
  resumeExportId,
  resumeExportResult,
  invalidResumeExport,
} from './resume-export-result.js';

export const storedResumeExports = async (store) => ({
  exports: (
    await store.query((row) => row.id?.startsWith('jobs-resume-export:'))
  )
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
    .slice(0, 100)
    .map((row) => {
      const result = resumeExportResult(row);
      if (
        row.version !== 1 ||
        row.id !== `jobs-resume-export:${result.browserSlot}:${result.hash}`
      ) {
        invalidResumeExport();
      }
      return result;
    }),
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
  const handle = await fs.open(
    path.join(artifactRoot, exportId, hash, file.name),
    'r'
  );
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
