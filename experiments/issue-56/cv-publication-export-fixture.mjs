import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publicationDigest } from '../../js/src/jobs/cv-publication-git.js';
import {
  resumeCvFixture,
  resumeExportReceipt,
  resumeExportFixtureContent,
} from './resume-export-fixture.mjs';

/** Reuses the existing native-export receipt and private-file contract. */
export const seedPublicationExport = async (fixture) => {
  const receipt = resumeExportReceipt('exported123');
  const content = Buffer.from(JSON.stringify(resumeCvFixture()));
  receipt.files = receipt.files.map((file) =>
    file.name === 'resume.json'
      ? { ...file, size: content.length, sha256: publicationDigest(content) }
      : file
  );
  const folder = path.join(
    fixture.artifactRoot,
    receipt.exportId,
    receipt.hash
  );
  await mkdir(folder, { recursive: true, mode: 0o700 });
  for (const file of receipt.files) {
    await writeFile(
      path.join(folder, file.name),
      file.name === 'resume.json'
        ? content
        : resumeExportFixtureContent(file.name),
      { mode: 0o600 }
    );
  }
  for (const id of [
    `jobs-resume-artifact:${receipt.exportId}:${receipt.hash}`,
    `jobs-resume-export:${receipt.browserSlot}:${receipt.hash}`,
  ]) {
    await fixture.store.put({ id, version: 1, ...receipt });
  }
  return {
    receipt,
    folder,
    content,
    input: {
      ...fixture.input,
      exportId: receipt.exportId,
      resumes: [receipt.hash],
    },
  };
};
