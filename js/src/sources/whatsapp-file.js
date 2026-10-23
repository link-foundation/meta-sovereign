/**
 * Import one WhatsApp "Export chat" file that arrived as bytes (R-Z9):
 * the `.txt`, or the `.zip` of an export with media. The text is parsed
 * by ./whatsapp-archive.js; the zip's other entries are only used to map
 * `<attached: ...>` names to files inside the zip (the media bytes are
 * not copied into the store).
 */

import { readZipEntries } from './auto-import/archive.js';
import { getSource, stampSourceLink } from './index.js';

const ZIP_LOCAL_HEADER = 0x04034b50;

const isZip = (name, bytes) =>
  /\.zip$/i.test(name) ||
  (bytes.length > 3 && bytes.readUInt32LE(0) === ZIP_LOCAL_HEADER);

const textEntry = (entries) =>
  entries.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ??
  entries.find((e) => /\.txt$/i.test(e.name));

export const importWhatsAppFile = async (store, name, bytes) => {
  let archive = { text: bytes.toString('utf8'), fileName: name, files: [] };
  if (isZip(name, bytes)) {
    const entries = readZipEntries(bytes);
    const chat = textEntry(entries);
    if (!chat) {
      throw new Error('no chat .txt found in this zip');
    }
    archive = {
      text: chat.read().toString('utf8'),
      fileName: /whatsapp/i.test(chat.name) ? chat.name : name,
      files: entries.map((e) => e.name),
    };
  }
  const links = await getSource('whatsapp').parseArchive(archive);
  for (const link of links) {
    await store.put(stampSourceLink(link, 'whatsapp'));
  }
  return { imported: links.length, chat: links[0]?.chat ?? null };
};
