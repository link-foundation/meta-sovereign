/**
 * Archive uploads (R-Z23):
 *   POST /api/archive/upload?source=<network>&name=<file name>
 *        (application/octet-stream body: the file's bytes)
 *     -> { ok, imported, files: [{ name, imported, error? }], media?, chat? }
 *
 * The page's import box sends an export it was given (a Facebook, X,
 * LinkedIn or WhatsApp .zip, a Telegram result.json, ...) here. The bytes
 * are streamed to a private temp folder in the store (never held in
 * memory, never base64, no fixed size cap) and read by the same importer
 * as auto-import (../sources/auto-import/files.js: a zip is opened in
 * place, media copied to `<store>/media/<network>/`); a WhatsApp export
 * keeps its own importer (../sources/whatsapp-file.js), which copies the
 * attachments its chat names. The temp file is removed afterwards, and
 * leftovers of a crash are swept on the next upload.
 *
 * Not JSON, so not isTrustedMutation's check: its own, as for the Telegram
 * upload — the bytes' type is not one a form on another site can send
 * without asking first (CORS), and another site's page is refused. A disk
 * without room for the file twice over (the file and what it becomes)
 * is refused before anything is written (507).
 */

import { createWriteStream, promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { json } from './util.js';
import { classifyOrigin } from './cors.js';
import { safeMessage } from './redact.js';
import { enoughSpace } from '../storage/disk-space.js';
import { ensurePrivateDir } from '../storage/durable.js';
import { autoImportRecipes } from '../sources/auto-import/recipes.js';
import { importDownloadedFile } from '../sources/auto-import/files.js';
import { importWhatsAppPath } from '../sources/whatsapp-file.js';
import { isFatalWrite } from '../sources/archive/context.js';

export const ARCHIVE_UPLOAD_ROUTE = '/api/archive/upload';
const UPLOADS = 'uploads';
// A temp folder this old is a crashed upload's.
const STALE_MS = 6 * 60 * 60_000;

const reply = (res, status, body) =>
  json(res, status, { ok: status < 400, ...body }) ?? true;

// Refused before the body was read: drain it so the socket stays usable.
const refuse = (req, res, status, code, error) => {
  req.resume();
  return reply(res, status, { error, code });
};

/** A plain file name: no folders or control characters, at most 200 long. */
export const uploadName = (raw) => {
  const base = path.posix.basename(String(raw ?? '').replace(/\\/g, '/'));
  const clean = [...base]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .slice(-200);
  return clean && clean !== '.' && clean !== '..' ? clean : 'archive';
};

const sweepStale = async (root, now = Date.now()) => {
  for (const name of await fs.readdir(root).catch(() => [])) {
    const dir = path.join(root, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat?.isDirectory() && now - stat.mtimeMs > STALE_MS) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
};

const importUploaded = async (store, { source, name, file, mediaDir }) => {
  if (source === 'whatsapp') {
    const out = await importWhatsAppPath(store, name, file, { mediaDir });
    return { ...out, files: [{ name, imported: out.imported }] };
  }
  const files = await importDownloadedFile({
    store,
    provider: source,
    filePath: file,
    mediaDir,
  });
  return {
    imported: files.reduce((sum, row) => sum + (row.imported ?? 0), 0),
    files,
  };
};

// The answer's status: a full disk, a file with nothing to import, or done.
const statusOf = (out) => {
  if (out.files.some((row) => row.aborted)) {
    return 507;
  }
  return out.imported === 0 && out.files.every((row) => row.error) ? 400 : 200;
};

const failed = (out) => {
  const status = statusOf(out);
  if (status === 200) {
    return {};
  }
  const row = out.files.find((r) => r.error);
  return {
    error: row?.error ?? 'nothing to import',
    code: status === 507 ? 'store-write-failed' : 'bad-archive',
  };
};

const NOT_WHOLE = Object.freeze([
  400,
  { error: 'the file did not arrive whole; try again', code: 'upload-failed' },
]);

// The bytes to `file`, then the import: `[status, body]`.
const importInto = async (req, ctx, file, { source, name, size }) => {
  try {
    await pipeline(req, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  } catch {
    return NOT_WHOLE;
  }
  if ((await fs.stat(file)).size !== size) {
    return NOT_WHOLE;
  }
  try {
    const out = await importUploaded(ctx.store, {
      source,
      name,
      file,
      mediaDir: path.join(ctx.storeDir, 'media'),
    });
    return [statusOf(out), { ...out, ...failed(out) }];
  } catch (error) {
    // A full or unwritable disk is not a bad file (R-Z14).
    return isFatalWrite(error)
      ? [507, { error: safeMessage(error), code: 'store-write-failed' }]
      : [400, { error: safeMessage(error), code: 'bad-archive' }];
  }
};

// The temp folder is gone before the answer is sent.
const receive = async (req, res, ctx, wanted) => {
  const root = path.join(ctx.storeDir, UPLOADS);
  await ensurePrivateDir(root);
  await sweepStale(root);
  const dir = path.join(root, randomBytes(8).toString('hex'));
  await ensurePrivateDir(dir);
  let answer;
  try {
    answer = await importInto(req, ctx, path.join(dir, wanted.name), wanted);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return reply(res, ...answer);
};

/** POST /api/archive/upload (see the header). */
export const handleArchiveUpload = async (store, req, res, p, ctx) => {
  if (p !== ARCHIVE_UPLOAD_ROUTE || req.method !== 'POST') {
    return false;
  }
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (
    !type.startsWith('application/octet-stream') ||
    classifyOrigin(req, ctx?.allowOrigins ?? []) === 'denied'
  ) {
    return refuse(
      req,
      res,
      403,
      'forbidden',
      'archives are sent from the app only'
    );
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const source = query.get('source') ?? '';
  if (!Object.hasOwn(autoImportRecipes, source)) {
    return refuse(
      req,
      res,
      400,
      'bad-source',
      `no archive import for "${source}"`
    );
  }
  if (!ctx?.storeDir) {
    return refuse(
      req,
      res,
      501,
      'no-store',
      'archive uploads need a store folder'
    );
  }
  const size = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(size) || size <= 0) {
    return refuse(req, res, 411, 'length-required', 'the file size is needed');
  }
  const space = await enoughSpace(ctx.storeDir, size * 2, ctx.diskFree);
  if (!space.ok) {
    return refuse(
      req,
      res,
      507,
      'low-disk',
      `not enough free disk space for this file: about ${Math.ceil(space.needed / 1048576)} MB needed`
    );
  }
  return receive(
    req,
    res,
    { ...ctx, store },
    {
      source,
      name: uploadName(query.get('name')),
      size,
    }
  );
};
