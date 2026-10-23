/**
 * Turn what the auto-import browser produced — downloaded export files
 * or the DOM of an open chat — into unified message links.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSource, stampSourceLink, buildMessageLink } from '../index.js';
import { archiveReaderFor } from './archive.js';
import { autoImportRecipes } from './recipes.js';

const toArchive = (recipe, name, text, context = {}) => {
  if (recipe.toArchive) {
    return recipe.toArchive(name, text, context);
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

const parseEntry = async (provider, recipe, name, data, context) => {
  const archive = toArchive(recipe, name, data.toString('utf8'), context);
  return (await getSource(provider).parseArchive(archive)) ?? [];
};

/**
 * Import one downloaded file. Containers are unpacked and only entries
 * whose path matches `recipe.files` are parsed; a plain file is parsed
 * when its name matches. Returns one report row per parsed file.
 */
export const importDownloadedFile = async ({ store, provider, filePath }) => {
  const recipe = autoImportRecipes[provider];
  if (!recipe) {
    throw new Error(`no auto-import recipe for "${provider}"`);
  }
  const name = path.basename(filePath);
  const buf = await fs.readFile(filePath);
  const reader = archiveReaderFor(name, buf);
  const candidates = reader
    ? reader(buf).filter((entry) => recipe.files.test(entry.name))
    : recipe.files.test(name)
      ? [{ name, read: () => buf }]
      : [];
  const names = reader ? reader(buf).map((entry) => entry.name) : [];
  const reports = [];
  for (const entry of candidates) {
    const label = reader ? `${name}:${entry.name}` : name;
    try {
      const links = await parseEntry(
        provider,
        recipe,
        entry.name,
        entry.read(),
        // The container's own name and file list (WhatsApp names the chat
        // after the zip and finds the media in it).
        { container: reader ? name : null, entries: names }
      );
      for (const link of links) {
        await store.put(stampSourceLink(link, provider));
      }
      reports.push({ name: label, imported: links.length });
    } catch (error) {
      reports.push({ name: label, imported: 0, error: error.message });
    }
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
