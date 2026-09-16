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
 * adapter's `live*` methods; adapters expose browser-direct HTTP APIs
 * where the upstream service permits them and local-server fallback
 * hooks where browsers cannot speak the raw provider protocol.
 */

import { emailSource } from './email.js';
import { telegramSource } from './telegram.js';
import { vkSource } from './vk.js';
import { xSource } from './x.js';
import { whatsappSource } from './whatsapp.js';
import { facebookSource } from './facebook.js';
import { linkedinSource } from './linkedin.js';
import { habrCareerSource } from './habr-career.js';
import { hhSource } from './hh.js';
import { superjobSource } from './superjob.js';
import { githubSource } from './github.js';
import { upworkSource } from './upwork.js';
import { peoplePerHourSource } from './peopleperhour.js';
import { naukriSource } from './naukri.js';
import { vietnamworksSource } from './vietnamworks.js';
import { topcvSource } from './topcv.js';
import { withCvPlatform } from './cv-bridge.js';
export { buildMessageLink } from './link.js';
export {
  BrowserOnlySourceError,
  createJobBoardSource,
  jobBoardArchiveToLinks,
} from './job-board.js';
export {
  CvRuntimeUnavailableError,
  cvPlatformIdOf,
  cvPlatformOf,
  readSourceCv,
  withCvPlatform,
  writeSourceCv,
} from './cv-bridge.js';

export const sourceRegistry = {
  email: emailSource,
  telegram: telegramSource,
  vk: vkSource,
  x: xSource,
  whatsapp: whatsappSource,
  facebook: facebookSource,
  // Job boards carry a declarative CV plan on top of their message API.
  linkedin: withCvPlatform(linkedinSource),
  'habr-career': withCvPlatform(habrCareerSource),
  hh: withCvPlatform(hhSource),
  superjob: withCvPlatform(superjobSource),
  github: githubSource,
  upwork: upworkSource,
  peopleperhour: peoplePerHourSource,
  naukri: naukriSource,
  vietnamworks: vietnamworksSource,
  topcv: topcvSource,
};

/** Sources that map to a declarative CV plan. */
export const listCvSources = () =>
  Object.values(sourceRegistry)
    .filter((source) => source.cvPlatform)
    .map((source) => source.name);

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
