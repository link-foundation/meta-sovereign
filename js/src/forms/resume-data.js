import { formFailure as failure } from './options.js';

export const MAX_RESUME_BYTES = 8 * 1024 ** 2;
export const decodeResumePdf = (file) => {
  if (
    !file ||
    typeof file.name !== 'string' ||
    !/^[^/\\\p{Cc}]{1,120}\.pdf$/iu.test(file.name) ||
    typeof file.data !== 'string' ||
    !file.data ||
    file.data.length > Math.ceil(MAX_RESUME_BYTES / 3) * 4
  ) {
    throw failure('form-upload-file', 'Choose a PDF résumé of at most 8 MiB.');
  }
  let binary;
  try {
    binary = globalThis.atob(file.data);
  } catch {
    throw failure('form-upload-file', 'Choose a PDF résumé of at most 8 MiB.');
  }
  if (
    globalThis.btoa(binary) !== file.data ||
    binary.length > MAX_RESUME_BYTES ||
    !binary.startsWith('%PDF-') ||
    !binary.slice(-8192).includes('%%EOF')
  ) {
    throw failure('form-upload-file', 'Choose a PDF résumé of at most 8 MiB.');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const pdfMetadata = (file, bytes, sha256) => ({
  name: file.name,
  size: bytes.length,
  type: 'application/pdf',
  sha256,
});
export const portableResumePdf = async (file) => {
  const bytes = decodeResumePdf(file);
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes)
  );
  return pdfMetadata(
    file,
    bytes,
    Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  );
};
