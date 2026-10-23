/**
 * What an export writes to its folder (R-Y186): `result.json` as Telegram
 * Desktop's machine-readable export has it (`name`, `type`, `id`,
 * `messages[]`), written message by message so a cancelled export still
 * leaves a valid file, and/or the HTML pages (./telegram-export-html.js);
 * plus the chat's name, kind and id as the export's header says them.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHtmlWriter } from './telegram-export-html.js';

/** The key the names map uses for a chat id: `user7`, `chat5`, `channel9`. */
export const keyOfChat = (chat) => {
  const id = String(chat);
  if (id.startsWith('-100')) {
    return `channel${id.slice(4)}`;
  }
  return id.startsWith('-') ? `chat${id.slice(1)}` : `user${id}`;
};

/** The chat's number in the export (Desktop writes it without the sign). */
export const exportIdOf = (chat) => {
  const key = keyOfChat(chat);
  return Number(key.replace(/^\D+/, ''));
};

/**
 * `{ name, type, id }` of the chat, from what the first answer told of it
 * (`entities`: key → `{ title, bot, self, username, megagroup }`).
 */
export const chatMeta = ({ chat, chatName, entities }) => {
  const key = keyOfChat(chat);
  const known = entities.get(key) ?? {};
  const name = known.title || chatName || `chat ${exportIdOf(chat)}`;
  let type = 'private_group';
  if (key.startsWith('user')) {
    type = known.self
      ? 'saved_messages'
      : known.bot
        ? 'bot_chat'
        : 'personal_chat';
  } else if (key.startsWith('channel')) {
    const scope = known.username ? 'public' : 'private';
    type = `${scope}_${known.megagroup ? 'supergroup' : 'channel'}`;
  }
  return { name, type, id: exportIdOf(chat) };
};

const openJson = async (file, meta) => {
  const handle = await fs.open(file, 'w');
  const head = ['name', 'type', 'id']
    .map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(meta[k])},`)
    .join('\n');
  await handle.write(`{\n${head}\n "messages": [`);
  let count = 0;
  return {
    add: async (msg) => {
      const body = JSON.stringify(msg, null, 1).replace(/^/gm, '  ');
      await handle.write(`${count > 0 ? ',' : ''}\n${body}`);
      count += 1;
    },
    close: async () => {
      await handle.write(`${count > 0 ? '\n ' : ''}]\n}\n`);
      await handle.close();
    },
  };
};

/**
 * Opens the folder's writers for `formats` (`'json'`, `'html'`):
 * `{ add(msg, segments), close() }`.
 */
export const openOutput = async ({ folder, formats, meta }) => {
  await fs.mkdir(folder, { recursive: true });
  const json = formats.includes('json')
    ? await openJson(path.join(folder, 'result.json'), meta)
    : null;
  const html = formats.includes('html')
    ? await createHtmlWriter({ dir: folder, title: meta.name })
    : null;
  return {
    add: async (msg, segments) => {
      await json?.add(msg);
      await html?.add(msg, segments);
    },
    close: async () => {
      await json?.close();
      await html?.close();
    },
  };
};
