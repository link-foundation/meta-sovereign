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
import { emailOptionsFrom, secretValue } from './email-store.js';
import { putAll } from '../storage/universal.js';
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
import { WEB_UIS } from './web-uis.js';
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
export {
  MEMBER_GROUP_KINDS,
  isTypingActive,
  memberLink,
  personLink,
  setTypingFor,
  syncMembership,
  typingLink,
} from './live-links.js';
export { vkTypingFromUpdate } from './vk.js';
export {
  VK_TOKEN_SOURCES,
  classifyVkOAuthGate,
  describeVkError,
  inspectVkToken,
  probeVkOAuthGate,
  rankVkTokenSources,
} from './vk-auth.js';

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
  return putAll(store, messages);
};

// The names the connection screens save a network's token under.
const TOKEN_KEYS = ['access-token', 'token', 'bot-token', 'bearer-token'];

// Other saved settings an adapter takes as `live` options.
const OPTION_KEYS = {
  'phone-number-id': 'phoneNumberId',
  'page-id': 'pageId',
  'author-urn': 'author',
  'organization-id': 'organizationId',
  'user-id': 'userId',
};

const secretToken = async (store, source, explicitId) => {
  const ids = [
    explicitId,
    ...TOKEN_KEYS.map((key) => `secret:${source}:${key}`),
  ].filter(Boolean);
  for (const id of ids) {
    const token = secretValue(await store.get(id));
    if (token) {
      return token;
    }
  }
  return null;
};

/**
 * The `live` options a network's saved connection gives: its token and
 * the ids its API needs (WhatsApp's phone number id, a Facebook page…),
 * read from the `secret:<source>:*` links. Values never leave the
 * server; nothing here is logged.
 */
export const liveOptionsFrom = async (store, source) => {
  // Email's host, login and password too, and its sync and thread helpers (R-Z5).
  const options = source === 'email' ? await emailOptionsFrom(store) : {};
  const token = await secretToken(store, source);
  if (token) {
    options.token = token;
  }
  for (const [key, name] of Object.entries(OPTION_KEYS)) {
    const value = secretValue(await store.get(`secret:${source}:${key}`));
    if (value) {
      options[name] = value;
    }
  }
  return options;
};

/**
 * Read a network in its own web app when its API cannot (R-Y38): the
 * chat list, then the newest messages of the first `chats` chats, kept
 * as links. `browser` is the sender (./browser-sender.js) with
 * `readChats` and `readRecent`; one chat is read at a time.
 */
export const pullBrowserInto = async (
  store,
  source,
  browser,
  { chats = 5, limit = 20 } = {}
) => {
  const rows = await browser.readChats({ source, limit: chats });
  const links = [];
  for (const row of rows.slice(0, chats)) {
    // A row known only by its title cannot be opened by URL.
    if (String(row.chat).startsWith('title:')) {
      continue;
    }
    const messages = await browser.readRecent({
      source,
      chat: row.chat,
      limit,
    });
    links.push(
      ...messages.map((m) =>
        row.title && !m.chatName ? { ...m, chatName: row.title } : m
      )
    );
  }
  await putAll(
    store,
    links.map((link) => stampSourceLink(link, source))
  );
  return {
    source,
    imported: links.length,
    nextOffset: null,
    rawCount: links.length,
    via: 'browser',
  };
};

// The web app can read this network for us.
const canReadInBrowser = (browser, source) =>
  Boolean(
    WEB_UIS[source]?.chats &&
    typeof browser?.readChats === 'function' &&
    typeof browser?.readRecent === 'function'
  );

/**
 * Pull a network's new messages into the store: its API first; with
 * `options.browser`, its web app when the API has no pull or refuses.
 */
export const pullLiveInto = async (store, source, options = {}) => {
  const { browser, ...rest } = options;
  try {
    return await pullApiInto(store, source, rest);
  } catch (error) {
    if (error.fallback === false || !canReadInBrowser(browser, source)) {
      throw error;
    }
    return pullBrowserInto(store, source, browser, {
      chats: options.chats,
      limit: options.browserLimit,
    });
  }
};

const pullApiInto = async (store, source, options = {}) => {
  const adapter = options.adapter ?? getSource(source);
  const live = options.live ?? adapter.live;
  if (!live?.pullMessages) {
    throw new Error(`${source} live API does not support pullMessages`);
  }
  const saved = await liveOptionsFrom(store, source);
  const token =
    options.token ??
    (options.secretId
      ? await secretToken(store, source, options.secretId)
      : null) ??
    saved.token ??
    null;
  // An option left undefined (a CLI flag not given) keeps the saved value.
  const given = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
  const result = await live.pullMessages({ ...saved, ...given, token });
  const links = result.links ?? [];
  await putAll(
    store,
    links.map((link) => stampSourceLink(link, source))
  );
  // What the pull remembers is written once the links are stored (R-Z5).
  await result.afterStore?.();
  return {
    source,
    imported: links.length,
    nextOffset: result.nextOffset ?? null,
    rawCount: result.rawCount ?? links.length,
  };
};
