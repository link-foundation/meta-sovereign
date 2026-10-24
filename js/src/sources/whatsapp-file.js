/**
 * Import one WhatsApp "Export chat" file that arrived as bytes (R-Z9,
 * R-Z15): the `.txt`, or the `.zip` of an export with media. The text is
 * parsed by ./whatsapp-archive.js. A zip is written to a private temp file
 * and read with the streaming reader (./archive/zip-file.js); each file
 * the chat names (`<attached: f>`, `f (file attached)`) is copied into
 * `<store>/media/whatsapp/<sha256>.<ext>` (0600) and the attachment gets
 * `path`, `sha256` and `size`, so the page can show it. Without a
 * `mediaDir` the names are mapped but no bytes are kept.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createArchiveContext } from './archive/context.js';
import { mediaSaver } from './archive/media-store.js';
import { openZipFile } from './archive/zip-file.js';
import { getSource, stampSourceLink } from './index.js';

const ZIP_LOCAL_HEADER = 0x04034b50;

const isZip = (name, bytes) =>
  /\.zip$/i.test(name) ||
  (bytes.length > 3 && bytes.readUInt32LE(0) === ZIP_LOCAL_HEADER);

const textEntry = (entries) =>
  entries.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ??
  entries.find((e) => /\.txt$/i.test(e.name));

// Copy each attachment's file into media/ and say where it went.
const withMedia = async (links, ctx, counts) => {
  const out = [];
  for (const link of links) {
    const attachments = [];
    for (const attachment of link.attachments ?? []) {
      const copy = attachment.file ? await ctx.media(attachment.file) : null;
      counts[copy ? 'saved' : 'missing'] += attachment.omitted ? 0 : 1;
      attachments.push(
        copy
          ? {
              ...attachment,
              path: copy.path,
              sha256: copy.sha256,
              size: copy.size,
            }
          : attachment
      );
    }
    out.push(attachments.length ? { ...link, attachments } : link);
  }
  return out;
};

// The chat, and its media copied out, of an export zip already on disk.
const readZipFile = async (name, file, mediaDir) => {
  const zip = await openZipFile(file);
  try {
    const chat = textEntry(zip.entries);
    if (!chat) {
      throw new Error('no chat .txt found in this zip');
    }
    const archive = {
      text: (await chat.read()).toString('utf8'),
      fileName: /whatsapp/i.test(chat.name) ? chat.name : name,
      files: zip.entries.map((e) => e.name),
    };
    const ctx = createArchiveContext({
      network: 'whatsapp',
      entries: zip.entries,
      save: mediaDir ? mediaSaver(mediaDir) : null,
    });
    const counts = { saved: 0, missing: 0 };
    const links = await withMedia(
      await getSource('whatsapp').parseArchive(archive),
      ctx,
      counts
    );
    return { links, media: { ...counts, warnings: ctx.warnings } };
  } finally {
    await zip.close();
  }
};

const readZip = async (name, bytes, mediaDir) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-whatsapp-'));
  const file = path.join(dir, 'export.zip');
  try {
    await fs.writeFile(file, bytes, { mode: 0o600 });
    return await readZipFile(name, file, mediaDir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

const readText = async (name, bytes) => ({
  links: await getSource('whatsapp').parseArchive({
    text: bytes.toString('utf8'),
    fileName: name,
    files: [],
  }),
  media: null,
});

const storeLinks = async (store, { links, media }) => {
  for (const link of links) {
    await store.put(stampSourceLink(link, 'whatsapp'));
  }
  return {
    imported: links.length,
    chat: links[0]?.chat ?? null,
    ...(media ? { media } : {}),
  };
};

export const importWhatsAppFile = async (
  store,
  name,
  bytes,
  { mediaDir = null } = {}
) =>
  storeLinks(
    store,
    isZip(name, bytes)
      ? await readZip(name, bytes, mediaDir)
      : await readText(name, bytes)
  );

/**
 * The same for a file already on disk (an upload streamed to a temp file,
 * R-Z23): a zip is read in place, never loaded whole.
 */
export const importWhatsAppPath = async (
  store,
  name,
  file,
  { mediaDir = null } = {}
) => {
  const handle = await fs.open(file, 'r');
  const head = Buffer.alloc(4);
  try {
    await handle.read(head, 0, 4, 0);
  } finally {
    await handle.close();
  }
  return storeLinks(
    store,
    isZip(name, head)
      ? await readZipFile(name, file, mediaDir)
      : await readText(name, await fs.readFile(file))
  );
};
