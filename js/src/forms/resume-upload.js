import { createHash } from 'node:crypto';
import { decodeResumePdf, pdfMetadata } from './resume-data.js';
export { MAX_RESUME_BYTES } from './resume-data.js';

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
  const buffer = Buffer.from(decodeResumePdf(file));
  return {
    buffer,
    metadata: pdfMetadata(
      file,
      buffer,
      createHash('sha256').update(buffer).digest('hex')
    ),
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
