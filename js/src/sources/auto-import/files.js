/**
 * Turn what the auto-import browser produced — downloaded export files
 * or the DOM of an open chat — into unified message links.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSource, stampSourceLink, buildMessageLink } from '../index.js';
import { archiveReaderFor } from './archive.js';
import { createArchiveContext, isFatalWrite } from '../archive/context.js';
import { alreadyImported, LEGACY } from '../archive/legacy.js';
import { mediaSaver } from '../archive/media-store.js';
import { isZipFile, openZipFile } from '../archive/zip-file.js';
import { autoImportRecipes } from './recipes.js';

const toArchive = (recipe, name, text, ctx) => {
  if (recipe.toArchive) {
    return recipe.toArchive(name, text, ctx);
  }
  const trimmed = text.trim();
  if (/\.json$/i.test(name) || /^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
};

const parseEntry = async (provider, recipe, entry, data, ctx) => {
  // `container` and `entries` are the container's own name and file list
  // (WhatsApp names the chat after the zip and finds the media in it, R-Z9).
  const entryCtx = { ...ctx, entryName: entry.name };
  // A recipe may decode its own bytes (VK's Windows-1251 pages, R-Z8).
  const text = recipe.decode
    ? recipe.decode(entry.name, data)
    : data.toString('utf8');
  const archive = toArchive(recipe, entry.name, text, entryCtx);
  return (await getSource(provider).parseArchive(archive, entryCtx)) ?? [];
};

// Numbered parts in order (message_2 before message_10); X's account.js
// first, since it says who "me" is for the message files after it.
const isAccount = (entry) => /(^|\/)account/i.test(entry.name);
const orderOf = (a, b) =>
  Number(isAccount(b)) - Number(isAccount(a)) ||
  a.name.localeCompare(b.name, 'en', { numeric: true });

const CHUNK = 500;

// Store the links in batches (one write per batch on a file store).
// A row an older build already imported under its old id is not written
// again (R-Z10, see ../archive/legacy.js).
const fresh = async (store, links, claimed) => {
  const out = [];
  for (const link of links) {
    if (!(await alreadyImported(store, link, claimed))) {
      const { [LEGACY]: _old, ...plain } = link;
      out.push(plain);
    }
  }
  return out;
};

const putLinks = async (store, rows, provider, onChunk, claimed) => {
  const links = await fresh(store, rows, claimed);
  for (let at = 0; at < links.length; at += CHUNK) {
    const batch = links
      .slice(at, at + CHUNK)
      .map((link) => stampSourceLink(link, provider));
    if (typeof store.putMany === 'function') {
      await store.putMany(batch);
    } else {
      for (const link of batch) {
        await store.put(link);
      }
    }
    onChunk?.(batch.length);
  }
};

// Reads the container: a ZIP is opened as a file (never loaded whole),
// a tar.gz or plain file is read into memory.
const openSource = async (filePath, name) => {
  if ((await isZipFile(filePath)) || /\.zip$/i.test(name)) {
    const zip = await openZipFile(filePath);
    return { entries: zip.entries, close: zip.close, container: true };
  }
  const buf = await fs.readFile(filePath);
  const reader = archiveReaderFor(name, buf);
  if (reader) {
    const entries = reader(buf).map((entry) => ({
      ...entry,
      read: async () => entry.read(),
    }));
    return { entries, close: async () => {}, container: true };
  }
  return {
    entries: [{ name, size: buf.length, read: async () => buf }],
    close: async () => {},
    container: false,
  };
};

const contextFor = (provider, source, name, mediaDir) => ({
  ...createArchiveContext({
    network: provider,
    entries: source.container ? source.entries : [],
    save: mediaDir ? mediaSaver(mediaDir) : null,
  }),
  container: source.container ? name : null,
  entries: source.container ? source.entries.map((e) => e.name) : [],
});

/**
 * Import one downloaded file. Containers are unpacked and only entries
 * whose path matches `recipe.files` are parsed; a plain file is parsed
 * when its name matches. Returns one report row per parsed file; a file
 * that fails becomes an error row and the rest still import (R-Z10). A
 * failed store or disk write (R-Z14) stops the import: the row says so
 * (`aborted: true`) and nothing after it is attempted. Photos, videos
 * and files named by the messages are copied to `<mediaDir>/<network>/`
 * (0600, named by sha256). `onProgress({ name, imported })` is called as
 * links are stored. Importing the same file twice stores the same ids.
 */
export const importDownloadedFile = async ({
  store,
  provider,
  filePath,
  mediaDir = null,
  onProgress = null,
}) => {
  const recipe = autoImportRecipes[provider];
  if (!recipe) {
    throw new Error(`no auto-import recipe for "${provider}"`);
  }
  const name = path.basename(filePath);
  const source = await openSource(filePath, name);
  try {
    const candidates = source.entries
      .filter((entry) => recipe.files.test(entry.name))
      .sort(orderOf);
    const ctx = contextFor(provider, source, name, mediaDir);
    const claimed = new Set();
    const reports = [];
    for (const entry of candidates) {
      const label = source.container ? `${name}:${entry.name}` : name;
      const report = { name: label, imported: 0 };
      reports.push(report);
      try {
        const data = await entry.read();
        const links = await parseEntry(provider, recipe, entry, data, ctx);
        await putLinks(
          store,
          links,
          provider,
          (n) => {
            report.imported += n;
            onProgress?.({ name: label, imported: report.imported });
          },
          claimed
        );
      } catch (error) {
        report.error = error.message;
        if (isFatalWrite(error)) {
          report.aborted = true;
          report.code = error.code ?? 'STORE_WRITE_FAILED';
          break;
        }
      }
    }
    if (ctx.warnings.length > 0 && reports.length > 0) {
      reports.at(-1).warnings = ctx.warnings.slice(0, 20);
    }
    if (candidates.length === 0) {
      reports.push({
        name,
        imported: 0,
        skipped: true,
        error: `no ${provider} export data found in this file`,
      });
    }
    return reports;
  } finally {
    await source.close();
  }
};

/**
 * Runs inside the page (serialized by browser-commander), so it must
 * not reference anything outside its own body.
 */
export const extractVisibleMessages = (cfg) => {
  const first = (root, selector) =>
    selector ? root.querySelector(selector) : null;
  const textOf = (node) => (node?.textContent ?? '').trim();
  const attrOf = (node, names) => {
    for (const name of names ?? []) {
      const value = node.getAttribute(name);
      if (value) {
        return value;
      }
    }
    return null;
  };
  const doc = globalThis.document;
  const chat = textOf(first(doc, cfg.chat)) || doc.title;
  let lastSender = '';
  const out = [];
  doc.querySelectorAll(cfg.message).forEach((node, index) => {
    const own = (cfg.own ?? []).some(
      (cls) => node.classList.contains(cls) || node.closest(`.${cls}`)
    );
    const metaNode = first(node, cfg.meta);
    const meta = metaNode ? metaNode.getAttribute(cfg.metaAttribute) : null;
    const senderText = textOf(first(node, cfg.sender));
    const sender = own ? 'me' : senderText || lastSender || chat;
    if (!own && senderText) {
      lastSender = senderText;
    }
    const body = textOf(first(node, cfg.text));
    if (!body) {
      return;
    }
    out.push({
      id: attrOf(node, cfg.id) ?? String(index),
      chat,
      sender,
      body,
      meta,
      time: textOf(first(node, cfg.time)) || null,
    });
  });
  return out;
};

// WhatsApp's "[12:34, 10/12/2026] Alice: " prefix.
const META = /^\[([^\]]+)\]\s*(.*?):\s*$/;

const isoOrUndefined = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
};

/** Map page-extracted rows to message links (without storing them). */
export const scrapedRowsToLinks = (provider, rows) =>
  rows.map((row) => {
    const meta = row.meta ? META.exec(row.meta) : null;
    const sender = meta && row.sender !== 'me' ? meta[2] : row.sender;
    return buildMessageLink({
      source: provider,
      externalId: `web-${row.chat}-${row.id}`,
      sender,
      chat: row.chat,
      body: row.body,
      timestamp: isoOrUndefined(meta?.[1] ?? row.time),
    });
  });
