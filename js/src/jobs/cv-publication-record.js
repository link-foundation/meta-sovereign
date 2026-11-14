import { browserName } from '../browser/policy.js';
import { resumeHash } from './resume-list.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { resumeExportId } from './resume-export-result.js';
import { resumeCvFromLino, resumeCvLino } from './resume-cv.js';
import { jobsFailure, jobsObject } from './options.js';

export const cvPublicationFailure = () =>
  jobsFailure(
    'cv-publication-unverified',
    'Snapshot publication was not confirmed. Inspect the repository and remote before another attempt.'
  );
const invalid = () => {
  throw cvPublicationFailure();
};
const text = (value, max) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  value === value.trim() &&
  [...value].every((character) => {
    const code = character.codePointAt(0);
    return code > 31 && code !== 127;
  });
export const cvPublicationOptions = (input) => {
  jobsObject(input);
  const remote = input.remote ?? 'origin';
  const directory = input.directory ?? 'examples/cv-snapshots';
  const resumes = input.resumes;
  if (
    !text(input.repository, 2048) ||
    !text(remote, 64) ||
    !/^[a-zA-Z\d][a-zA-Z\d._-]{0,63}$/u.test(remote) ||
    !text(directory, 240) ||
    directory.split('/').length > 8 ||
    directory
      .split('/')
      .some((part) => !/^[a-zA-Z\d][a-zA-Z\d._-]*$/u.test(part)) ||
    !Array.isArray(resumes) ||
    !resumes.length ||
    resumes.length > 20 ||
    new Set(resumes).size !== resumes.length
  ) {
    invalid();
  }
  return {
    requestId: resumeExportRequestId(input.requestId),
    browserSlot: browserName(input.browserSlot ?? 'jobs'),
    repository: input.repository,
    remote,
    directory,
    resumes: resumes.map(resumeHash).sort(),
    ...(input.exportId === undefined
      ? {}
      : { exportId: resumeExportId(input.exportId) }),
  };
};
const hex = (value, lengths) =>
  typeof value === 'string' &&
  lengths.includes(value.length) &&
  /^[a-f\d]+$/u.test(value);
export const cvPublicationFile = (row, directory) => {
  if (
    !row ||
    !['en', 'ru'].includes(row.language) ||
    !hex(row.sha256, [64]) ||
    !hex(row.sourceSha256, [64]) ||
    !Number.isFinite(Date.parse(row.savedAt)) ||
    !Number.isInteger(row.bytes) ||
    row.bytes < 1 ||
    row.bytes > 1024 ** 2 ||
    typeof row.content !== 'string' ||
    row.content.length > 1024 ** 2
  ) {
    invalid();
  }
  const hash = resumeHash(row.hash);
  const file = `${directory}/cv.${row.language}.${hash}.${row.sha256}.lino`;
  if (
    row.path !== file ||
    resumeCvLino(resumeCvFromLino(row.content)) !== row.content
  ) {
    invalid();
  }
  return {
    hash,
    language: row.language,
    path: file,
    sha256: row.sha256,
    sourceSha256: row.sourceSha256,
    savedAt: row.savedAt,
    bytes: row.bytes,
    content: row.content,
  };
};
const validMetadata = (raw) =>
  raw.version === 1 &&
  [
    'planned',
    'attempting',
    'committed',
    'published',
    'unchanged',
    'uncertain',
  ].includes(raw.state) &&
  hex(raw.confirmation, [64]) &&
  hex(raw.base, [40, 64]) &&
  hex(raw.remoteFingerprint, [64]) &&
  text(raw.destination, 4096) &&
  text(raw.branch, 250) &&
  Number.isFinite(Date.parse(raw.createdAt)) &&
  Number.isFinite(Date.parse(raw.expiresAt)) &&
  Date.parse(raw.expiresAt) - Date.parse(raw.createdAt) === 86400000;
const validReceipt = (raw) =>
  (raw.commit === null || hex(raw.commit, [40, 64])) &&
  (!['published', 'committed'].includes(raw.state) || raw.commit !== null) &&
  (raw.code === null || raw.code === 'jobs-cv-publication-unverified');
const sameIdentity = (input, options) =>
  (input.requestId === undefined || input.requestId === options.requestId) &&
  (input.exportId === undefined || input.exportId === options.exportId) &&
  (input.browserSlot === undefined ||
    input.browserSlot === options.browserSlot);
export const cvPublicationResult = (raw, input = {}) => {
  const options = cvPublicationOptions(raw);
  if (
    !validMetadata(raw) ||
    !validReceipt(raw) ||
    !sameIdentity(input, options) ||
    !Array.isArray(raw.files) ||
    raw.files.length !== options.resumes.length ||
    JSON.stringify(raw).length > 4 * 1024 ** 2 + 16384
  ) {
    invalid();
  }
  const files = raw.files.map((row) =>
    cvPublicationFile(row, options.directory)
  );
  if (
    JSON.stringify(files.map((row) => row.hash).sort()) !==
    JSON.stringify(options.resumes)
  ) {
    invalid();
  }
  return {
    ...options,
    version: 1,
    state: raw.state,
    confirmation: raw.confirmation,
    base: raw.base,
    remoteFingerprint: raw.remoteFingerprint,
    destination: raw.destination,
    branch: raw.branch,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    files,
    commit: raw.commit,
    code: raw.code,
  };
};
