/**
 * MessageSource adapter framework.
 *
 * Each external network is wrapped in a `MessageSource` whose only
 * required method is `parseArchive(input)` — given an export file (or
 * a parsed object) it yields unified `Message` links.
 *
 * The unified `Message` link shape:
 *   id        = `msg:<source>:<external_id>`
 *   tokens    = ['message', source, externalId]
 *   children  = ids of sender, chat, body, timestamp links
 *
 * Adapters use the helpers below to keep their code small. Live
 * network APIs (token flows, OAuth, rate limits) belong inside each
 * adapter's `live*` methods; Telegram ships a Bot API implementation
 * and the remaining adapters expose archive parsers until their live
 * API credentials and flows are configured.
 */

import { telegramSource } from './telegram.js';
import { vkSource } from './vk.js';
import { xSource } from './x.js';
import { whatsappSource } from './whatsapp.js';
import { facebookSource } from './facebook.js';
import { linkedinSource } from './linkedin.js';
import { habrCareerSource } from './habr-career.js';
import { hhSource } from './hh.js';
import { superjobSource } from './superjob.js';
export { buildMessageLink } from './link.js';

export const sourceRegistry = {
  telegram: telegramSource,
  vk: vkSource,
  x: xSource,
  whatsapp: whatsappSource,
  facebook: facebookSource,
  linkedin: linkedinSource,
  'habr-career': habrCareerSource,
  hh: hhSource,
  superjob: superjobSource,
};

export const listSources = () => Object.keys(sourceRegistry);

export const getSource = (name) => {
  const s = sourceRegistry[name];
  if (!s) {
    throw new Error(
      `unknown source "${name}"; known: ${listSources().join(', ')}`
    );
  }
  return s;
};

export const sourceHandlerId = (source) => `source:${source}:live`;

export const stampSourceLink = (link, source) => {
  const at = Date.now();
  const by = sourceHandlerId(source);
  return {
    ...link,
    handled: { at, by },
    handledBy: { ...(link.handledBy ?? {}), [by]: at },
  };
};

export const importInto = async (store, source, archive) => {
  const adapter = getSource(source);
  const messages = await adapter.parseArchive(archive);
  for (const m of messages) {
    await store.put(m);
  }
  return messages.length;
};

const secretToken = async (store, source, explicitId) => {
  const ids = [
    explicitId,
    `secret:${source}:bot-token`,
    `secret:${source}:token`,
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

export const pullLiveInto = async (store, source, options = {}) => {
  const adapter = options.adapter ?? getSource(source);
  const live = options.live ?? adapter.live;
  if (!live?.pullMessages) {
    throw new Error(`${source} live API does not support pullMessages`);
  }
  const token =
    options.token ?? (await secretToken(store, source, options.secretId));
  const result = await live.pullMessages({ ...options, token });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, source));
  }
  return {
    source,
    imported: links.length,
    nextOffset: result.nextOffset ?? null,
    rawCount: result.rawCount ?? links.length,
  };
};
