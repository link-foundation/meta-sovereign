/** Export one frozen account/peer cache with bounded existing output writers. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  cacheRequest,
  cacheId,
  cacheSummary,
  checkedCacheRecord,
} from './vk-cache-shape.js';
import { ownedCachePage, invalidCacheEvidence } from './vk-cache-provider.js';
import { checkFolder } from './telegram-export-paths.js';
import { createMarkdownWriter } from './telegram-export-markdown.js';

const exportMessage = (message, peerId) => ({
  id: message.id,
  source_chat: String(peerId),
  from: `https://vk.com/${message.from_id < 0 ? 'club' : 'id'}${Math.abs(message.from_id)}`,
  from_url: `https://vk.com/${message.from_id < 0 ? 'club' : 'id'}${Math.abs(message.from_id)}`,
  date: new Date(message.date * 1000).toISOString(),
  text: message.text,
  reply_text: message.reply_message?.text,
  // Full native evidence remains in the linked structured part, including
  // replies, forwards, attachments and exact direction; no media is downloaded.
  raw: message,
});
export const exportVkCache = async (
  store,
  input,
  { storeDir, now = Date.now } = {}
) => {
  const request = cacheRequest({ kind: 'history', ...input });
  if (request.kind !== 'history') {
    throw Object.assign(new Error('Only message history can be exported'), {
      code: 'bad-request',
    });
  }
  const record = checkedCacheRecord(await store.get(cacheId(request)), request);
  if (!record) {
    throw Object.assign(new Error('Load history before exporting its cache'), {
      code: 'not-found',
    });
  }
  const checked = await checkFolder(input.folder, { storeDir });
  if (!checked.ok) {
    throw Object.assign(new Error(checked.code), { code: checked.code });
  }
  // Exclusive creation refuses existing directories, files and symlinks.
  await fs.mkdir(checked.folder, { recursive: false });
  const meta = {
    name: `VK ${request.peerId}`,
    source: 'vk',
    accountId: request.accountId,
    peerId: request.peerId,
    coverage: {
      complete: record.complete,
      cached: record.count,
      total: record.total,
      nextOffset: record.nextOffset,
      updatedAt: record.updatedAt,
      stale: cacheSummary(record, now()).stale,
    },
  };
  let writer;
  let messages = 0;
  try {
    writer = await createMarkdownWriter({
      folder: checked.folder,
      meta,
      maxLines: 1500,
      exclusive: true,
    });
    let prior = null;
    for (const ref of record.pages.toReversed()) {
      for (const message of (
        await ownedCachePage(store, request, ref)
      ).toReversed()) {
        if (prior !== null && message.id <= prior) {
          invalidCacheEvidence();
        }
        await writer.add(exportMessage(message, request.peerId));
        prior = message.id;
        messages++;
      }
    }
    if (messages !== record.count) {
      invalidCacheEvidence();
    }
    await writer.close();
    const files = (await fs.readdir(checked.folder)).sort();
    await fs.writeFile(
      path.join(checked.folder, 'manifest.json'),
      JSON.stringify({ ...meta, messages, files }, null, 2),
      { flag: 'wx' }
    );
    return {
      ok: true,
      folder: checked.folder,
      messages,
      files: [...files, 'manifest.json'],
      coverage: meta.coverage,
    };
  } catch (error) {
    // Retain partial output as evidence, but never label it a completed export.
    await writer?.close().catch(() => {});
    throw error;
  }
};
