// Shared text-only link recognition. No target is fetched or opened.
const LINK =
  /(?<![\p{L}\p{M}\p{N}_@.\-/])(?:[a-z][a-z\d+.-]{0,31}:\/\/[^\s<>"']+|(?:mailto|tel):[^\s<>"']+|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?)/giu;
const FILE_ENDINGS = new Set([
  'txt',
  'md',
  'js',
  'mjs',
  'json',
  'py',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'pdf',
  'zip',
  'exe',
  'doc',
  'docx',
  'csv',
  'log',
  'css',
  'rs',
  'ts',
  'sh',
]);
const SCHEME = /^[a-z][a-z\d+.-]*:/iu;
const TRAILING = /[.,;:!?)\]}»”’]+$/u;

/** Preserve target spelling, order and repetitions; URL paths can be case sensitive. */
export const textLinks = (text, { includeFileNames = false } = {}) => {
  const links = [];
  for (const match of String(text ?? '').matchAll(LINK)) {
    const link = match[0];
    const host = link.split(/[/?#:]/u)[0];
    if (
      includeFileNames ||
      SCHEME.test(link) ||
      !FILE_ENDINGS.has(host.split('.').at(-1).toLowerCase())
    ) {
      links.push(link);
    }
  }
  return links;
};

/** The first HTTP/bare-domain preview candidate, retaining the composer contract. */
export const linkOf = (text) =>
  textLinks(text)
    .find((link) => !SCHEME.test(link) || /^https?:/iu.test(link))
    ?.replace(TRAILING, '') ?? null;
