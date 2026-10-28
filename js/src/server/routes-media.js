/**
 * Imported archive media (R-Z15):
 *   GET /api/media/<network>/<sha256>[.<ext>]
 * serves a file that an archive import (R-Z10 Facebook/Messenger,
 * Instagram, X, LinkedIn; R-Z15 WhatsApp) copied to
 * `<store>/media/<network>/<sha256><ext>`. The path is built only from
 * validated parts (a fixed network list, 64 hex digits, a fixed extension
 * list), so nothing outside that folder can be named. Pictures, audio and
 * video are shown inline; everything else, svg and html included, is
 * offered as a download with a sandboxing CSP. Audio and video answer
 * `Range`. The file is streamed, never read whole.
 */

import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fail } from './util.js';
import { fromApp } from './routes-telegram-files.js';

export const MEDIA_NETWORKS = Object.freeze([
  'history',
  'facebook',
  'messenger',
  'instagram',
  'x',
  'linkedin',
  'whatsapp',
]);

const INLINE = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
};
// Downloaded, never shown: documents, archives, and the types a browser
// would run (svg, html), which are sent as opaque bytes.
const OPAQUE = 'application/octet-stream';
const DOWNLOAD = {
  bin: OPAQUE,
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  vcf: 'text/vcard; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  zip: 'application/zip',
  ...Object.fromEntries(
    [
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'heic',
      'heif',
      '3gp',
      'amr',
      'mkv',
      'svg',
      'html',
      'htm',
      'xml',
      'js',
    ].map((ext) => [ext, OPAQUE])
  ),
};

export const MEDIA_EXTENSIONS = Object.freeze([
  ...Object.keys(INLINE),
  ...Object.keys(DOWNLOAD),
]);

const URL_SHAPE =
  /^\/api\/media\/([a-z]{1,16})\/([0-9a-f]{64})(?:\.([a-z0-9]{1,8}))?$/;
const IN_MEDIA = /^\/api\/media(\/|$)/;

const refuse = (res, status, code, error) =>
  fail(res, status, code, error) ?? true;
const notFound = (res) => refuse(res, 404, 'not-found', 'no such media file');

/** `{network, sha256, ext}` of a valid media path, else null. */
export const parseMediaPath = (p) => {
  const m = URL_SHAPE.exec(p);
  if (!m || !MEDIA_NETWORKS.includes(m[1])) {
    return null;
  }
  const ext = m[3] ?? '';
  return ext && !MEDIA_EXTENSIONS.includes(ext)
    ? null
    : { network: m[1], sha256: m[2], ext };
};

const rangeOf = (header, size) => {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? ''));
  if (!m || (m[1] === '' && m[2] === '')) {
    return null;
  }
  const start = Math.max(0, m[1] === '' ? size - Number(m[2]) : Number(m[1]));
  const end =
    m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start <= end && start < size
    ? { start, end }
    : { unsatisfiable: true };
};

const send = ({ req, res, file, ext, size }) => {
  const inline = ext in INLINE;
  const headers = {
    'content-type': INLINE[ext] ?? DOWNLOAD[ext] ?? OPAQUE,
    'x-content-type-options': 'nosniff',
    'content-disposition': inline
      ? 'inline'
      : `attachment; filename="media${ext ? `.${ext}` : ''}"`,
    'cache-control': 'private, max-age=3600',
    'content-security-policy': "sandbox; default-src 'none'",
    'accept-ranges': inline ? 'bytes' : 'none',
  };
  const range = inline ? rangeOf(req.headers.range, size) : null;
  if (range?.unsatisfiable) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` });
    res.end();
    return true;
  }
  const part = range ?? { start: 0, end: size - 1 };
  res.writeHead(range ? 206 : 200, {
    ...headers,
    'content-length': size === 0 ? 0 : part.end - part.start + 1,
    ...(range
      ? { 'content-range': `bytes ${part.start}-${part.end}/${size}` }
      : {}),
  });
  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return true;
  }
  const stream = createReadStream(file, part);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return true;
};

/** GET /api/media/... (see the header). */
export const handleMediaGets = async (req, res, p, ctx) => {
  if (!IN_MEDIA.test(p) || (req.method !== 'GET' && req.method !== 'HEAD')) {
    return false;
  }
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(res, 403, 'forbidden', 'media loads only in the app');
  }
  const wanted = parseMediaPath(p);
  if (!wanted || !ctx?.storeDir) {
    return notFound(res);
  }
  const { network, sha256, ext } = wanted;
  const file = path.join(
    ctx.storeDir,
    'media',
    network,
    `${sha256}${ext ? `.${ext}` : ''}`
  );
  try {
    const info = await fs.lstat(file);
    return info.isFile()
      ? send({ req, res, file, ext, size: info.size })
      : notFound(res);
  } catch {
    return notFound(res);
  }
};
