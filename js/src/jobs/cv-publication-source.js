import { cvSnapshotsResult } from './cv-watch-record.js';
import { verifiedTechnologyCv } from './technology-cv.js';
import { resumeCvLino, sanitizedResumeCv } from './resume-cv.js';
import { publicationDigest } from './cv-publication-git.js';
import { cvPublicationFailure } from './cv-publication-record.js';

const savedSnapshots = async (store, options) => {
  const raw = await store.get(`jobs-cv-snapshots:${options.browserSlot}`);
  if (!raw || raw.version !== 1) {
    throw cvPublicationFailure();
  }
  return cvSnapshotsResult(raw, options).snapshots;
};
const exportedSnapshot = async (context, options, hash) => {
  const source = await verifiedTechnologyCv(context, { ...options, hash });
  return {
    hash,
    cv: sanitizedResumeCv(source.cv).cv,
    sha256: source.identity.sha256,
    savedAt: source.identity.capturedAt,
  };
};

/** Source selection never imports a draft or refreshes a browser/export. */
export const cvPublicationFiles = async (context, options) => {
  const snapshots = options.exportId
    ? null
    : await savedSnapshots(context.store, options);
  const files = [];
  for (const hash of options.resumes) {
    const snapshot = options.exportId
      ? await exportedSnapshot(context, options, hash)
      : snapshots.find((row) => row.hash === hash);
    if (!snapshot) {
      throw cvPublicationFailure();
    }
    const content = resumeCvLino(snapshot.cv);
    const sha256 = publicationDigest(content);
    const language = snapshot.cv.language;
    files.push({
      hash,
      language,
      path: `${options.directory}/cv.${language}.${hash}.${sha256}.lino`,
      sha256,
      sourceSha256: snapshot.sha256,
      savedAt: snapshot.savedAt,
      bytes: Buffer.byteLength(content),
      content,
    });
  }
  return files;
};
