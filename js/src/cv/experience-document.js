import { copyExperienceData, validateExperienceJobs } from './experience.js';
import { encodeLinoValue, decodeWire, LINO_TEXT } from '../transport/lino.js';

export const experienceDocumentFailure = () =>
  Object.assign(
    new Error('The structured experience document was not confirmed.'),
    {
      code: 'cv-experience-document',
    }
  );
const invalid = () => {
  throw experienceDocumentFailure();
};
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const sourceFields = (source) => {
  if (
    !object(source) ||
    typeof source.id !== 'string' ||
    !source.id.trim() ||
    source.id.length > 200 ||
    !['ru', 'en'].includes(source.language) ||
    typeof source.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(source.capturedAt)) ||
    new Date(source.capturedAt).toISOString() !== source.capturedAt
  ) {
    invalid();
  }
};
const sourceUrl = (source, platform) => {
  let url;
  try {
    url = new URL(source.url);
  } catch {
    invalid();
  }
  const intended =
    platform === 'hh'
      ? url.hostname === 'hh.ru' &&
        /^\/resume\/[a-zA-Z0-9_-]{1,100}\/?$/u.test(url.pathname)
      : url.hostname === 'www.linkedin.com' &&
        /^\/in\/[^/]+\/details\/experience\/?$/u.test(url.pathname);
  if (
    !intended ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    invalid();
  }
  if (url.pathname.split('/')[2] !== source.id) {
    invalid();
  }
};

/** A private, lossless interchange shape, independent of the legacy CV allowlist. */
export const validateExperienceDocument = (value) => {
  const document = copyExperienceData(value);
  if (
    !object(document) ||
    document.kind !== 'cv-experience' ||
    document.version !== 1 ||
    !['hh', 'linkedin'].includes(document.platform) ||
    !object(document.profile)
  ) {
    invalid();
  }
  sourceFields(document.source);
  sourceUrl(document.source, document.platform);
  document.jobs = validateExperienceJobs(document.jobs);
  return document;
};
const boundedBytes = (input) => {
  const size =
    typeof input === 'string'
      ? new TextEncoder().encode(input).length
      : input?.byteLength;
  if (!Number.isSafeInteger(size) || size > 4 * 1024 * 1024) {
    invalid();
  }
  return input;
};
export const experienceDocumentToLino = (document, type = LINO_TEXT) =>
  boundedBytes(encodeLinoValue(validateExperienceDocument(document), type));
// Refuse oversized files before handing them to the general wire decoder.
export const experienceDocumentFromLino = (input, type = LINO_TEXT) =>
  validateExperienceDocument(decodeWire(boundedBytes(input), type));
