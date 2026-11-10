import { createHash } from 'node:crypto';
import { formFailure as failure } from './options.js';

export const MAX_RESUME_BYTES = 8 * 1024 ** 2;
const acceptsPdf = (accept) =>
  !accept.trim() ||
  accept
    .split(',')
    .some((part) =>
      ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(
        part.trim().toLowerCase()
      )
    );

export const resumeUploadField = (field) =>
  field.tag === 'input' &&
  field.type === 'file' &&
  !field.disabled &&
  !field.readOnly &&
  !field.multiple &&
  field.upload?.complete === true &&
  !field.upload.directory &&
  acceptsPdf(field.upload.accept) &&
  /\b(?:r[eé]sum[eé]|cv)\b|резюм|简历|履歷|履历|जीवनवृत्त|सीवी/iu.test(
    `${field.label} ${field.description ?? ''}`
  );

export const resumePdf = (file) => {
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
  const buffer = Buffer.from(file.data, 'base64');
  if (
    buffer.toString('base64') !== file.data ||
    buffer.length > MAX_RESUME_BYTES ||
    !buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-') ||
    !buffer.subarray(-8192).includes(Buffer.from('%%EOF'))
  ) {
    throw failure('form-upload-file', 'Choose a PDF résumé of at most 8 MiB.');
  }
  return {
    buffer,
    metadata: {
      name: file.name,
      size: buffer.length,
      type: 'application/pdf',
      sha256: createHash('sha256').update(buffer).digest('hex'),
    },
  };
};

/** Read bytes only after the owner explicitly attaches this PDF. */
export const readUploadedPdf = async (node) => {
  const files = node.files;
  const file = files?.[0];
  if (files?.length !== 1 || !file || file.size > 8 * 1024 ** 2) {
    return null;
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    sha256: Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, '0')
    ).join(''),
  };
};
