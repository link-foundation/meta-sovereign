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
 * Adapters use the helpers below to keep their code small. Real
 * network APIs (token flows, OAuth, rate limits) belong inside each
 * adapter's `live*` methods, which are stubbed for now and will be
 * thickened by follow-up PRs.
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

export const buildMessageLink = ({
  source,
  externalId,
  sender,
  chat,
  body,
  timestamp,
  replyTo = null,
}) => ({
  id: `msg:${source}:${externalId}`,
  tokens: ['message', source, externalId],
  children: [
    `sender:${source}:${sender}`,
    `chat:${source}:${chat}`,
    `body:${source}:${externalId}`,
    `ts:${source}:${externalId}`,
    ...(replyTo ? [`replyto:${source}:${replyTo}`] : []),
  ],
  source,
  body,
  timestamp,
  sender,
  chat,
  replyTo,
});

export const importInto = async (store, source, archive) => {
  const adapter = getSource(source);
  const messages = await adapter.parseArchive(archive);
  for (const m of messages) {
    await store.put(m);
  }
  return messages.length;
};
