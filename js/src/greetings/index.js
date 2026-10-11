/**
 * Greetings (issue #35): open dialogs with a "hi" or a greeting sticker.
 *
 * Starting a conversation is the slow, repetitive part of outreach, so
 * this module does it in bulk the way konard/vk-bot does on VK:
 *
 *   - `planGreetings({links, mode: 'initiate'})` picks chats we have
 *     never written to — and, after them, chats that went quiet longest
 *     ago — and assigns each a greeting sticker or text;
 *   - `planGreetings({links, mode: 'reply'})` picks chats whose last
 *     message is an unanswered greeting ("Привет!", "hi", 👋, a
 *     greeting sticker) and answers in kind;
 *   - `runGreetings(plan, {store})` sends through each network's
 *     `live.post` (stickers where the network has them, text
 *     otherwise) and records `greeting:<network>:<chat>` so the same
 *     chat is not greeted twice.
 *
 * The planner is pure and deterministic given `random`, so the UI can
 * preview exactly what a queue run will send.
 */

import { getSource } from '../sources/index.js';
import {
  builtInGreetingStickers,
  greetingNetworks,
  greetingTexts,
  telegramDefaultGreetings,
  telegramGreetingSets,
  vkIncomingGreetingStickerIds,
} from './catalog.js';
import { detectGreetingLanguage, isGreetingMessage } from './detect.js';

export * from './catalog.js';
export * from './detect.js';

export const GREETING_SELECTION_ID = 'greetings:selection';
export const greetingLinkId = (network, chat) => `greeting:${network}:${chat}`;

const HOUR_MS = 60 * 60 * 1000;

/** Every sticker id the detector should treat as a greeting. */
export const knownGreetingStickerIds = () =>
  new Set([
    ...Object.values(builtInGreetingStickers)
      .flat()
      .map((sticker) => sticker.id),
    ...vkIncomingGreetingStickerIds,
  ]);

/**
 * The catalogue the UI and CLI render: per-network capabilities, the
 * built-in stickers with their direct preview links, the Telegram sets
 * listed live, and the greeting texts.
 */
export const greetingCatalogue = () => ({
  networks: greetingNetworks,
  stickers: builtInGreetingStickers,
  telegram: {
    sets: telegramGreetingSets,
    defaultGreetings: telegramDefaultGreetings,
  },
  texts: greetingTexts,
});

/**
 * The selection used when the user has not picked anything yet: the
 * stickers vk-bot itself greets with, plus Messenger's always-available
 * thumbs-up, plus every Telegram set to list live.
 */
export const defaultGreetingSelection = () => ({
  stickers: Object.values(builtInGreetingStickers)
    .flat()
    .filter((sticker) => sticker.common),
  telegramSets: telegramGreetingSets.map((set) => set.name),
  texts: greetingTexts,
  language: 'en',
  prefer: 'sticker',
});

const pickSticker = (sticker) => ({
  network: String(sticker.network),
  id:
    sticker.id === undefined || sticker.id === null ? null : String(sticker.id),
  url: sticker.url ?? null,
  previewUrl: sticker.previewUrl ?? null,
  pack: sticker.pack ?? sticker.packTitle ?? null,
  emoji: sticker.emoji ?? null,
  thumbnailFileId: sticker.thumbnailFileId ?? null,
});

/**
 * Validates and normalises a selection coming from the UI or CLI.
 * Unknown networks and stickers without an id or url are dropped.
 */
export const normalizeGreetingSelection = (input = {}) => {
  const base = defaultGreetingSelection();
  const stickers = Array.isArray(input.stickers)
    ? input.stickers
        .filter((s) => s && greetingNetworks[s.network] && (s.id || s.url))
        .map(pickSticker)
    : base.stickers.map(pickSticker);
  const texts = { ...base.texts };
  for (const [lang, list] of Object.entries(input.texts ?? {})) {
    const clean = (Array.isArray(list) ? list : [list])
      .map((t) => String(t ?? '').trim())
      .filter(Boolean);
    if (clean.length > 0) {
      texts[lang] = clean;
    }
  }
  return {
    stickers,
    telegramSets: Array.isArray(input.telegramSets)
      ? input.telegramSets.map(String).filter((n) => /^\w{1,64}$/.test(n))
      : base.telegramSets,
    texts,
    language: texts[input.language] ? input.language : base.language,
    prefer: input.prefer === 'text' ? 'text' : 'sticker',
  };
};

export const loadGreetingSelection = async (store) => {
  const link = await store.get(GREETING_SELECTION_ID);
  return link?.selection
    ? normalizeGreetingSelection(link.selection)
    : defaultGreetingSelection();
};

export const saveGreetingSelection = async (store, input) => {
  const selection = normalizeGreetingSelection(input);
  await store.put({
    id: GREETING_SELECTION_ID,
    tokens: ['greetings', 'selection'],
    children: [],
    selection,
    updatedAt: new Date().toISOString(),
  });
  return selection;
};

const timeOf = (link) => {
  const value = link.timestamp;
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    // Unix seconds (VK, WhatsApp) vs. milliseconds.
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const ownSenders = (me) => new Set(['me', ...[me ?? []].flat().map(String)]);

const isChatMessage = (link) =>
  Boolean(link?.id?.startsWith?.('msg:') && link.source && link.chat);

const emptyChat = (link) => ({
  network: link.source,
  chat: String(link.chat),
  contact: null,
  outgoing: 0,
  incoming: 0,
  last: null,
  lastOutgoing: false,
});

/**
 * Folds message links into one summary per `network:chat`.
 * @param {Array<object>} links message links (`msg:*`)
 * @param {{me?: string|string[]}} [opts] sender ids that are the user
 *   (archives mark them `me`; live VK pulls carry the numeric id)
 */
export const summarizeChats = (links, { me = null } = {}) => {
  const mine = ownSenders(me);
  const chats = new Map();
  for (const link of (links ?? []).filter(isChatMessage)) {
    const key = `${link.source}:${link.chat}`;
    const chat = chats.get(key) ?? emptyChat(link);
    const outgoing = mine.has(String(link.sender));
    chat[outgoing ? 'outgoing' : 'incoming'] += 1;
    if (!outgoing && !chat.contact) {
      chat.contact = String(link.sender);
    }
    if (!chat.last || timeOf(link) >= timeOf(chat.last)) {
      chat.last = link;
      chat.lastOutgoing = outgoing;
    }
    chats.set(key, chat);
  }
  return [...chats.values()];
};

const randomIndex = (random, length) =>
  Math.min(length - 1, Math.floor(random() * length));

const stickersFor = (selection, network) =>
  (selection.stickers ?? []).filter((s) => s.network === network);

/**
 * Chooses what to send into one chat: a sticker when the network has
 * stickers and the selection holds some for it, text otherwise.
 */
const chooseGreeting = ({ selection, network, language, random }) => {
  const stickers = stickersFor(selection, network);
  if (
    selection.prefer !== 'text' &&
    greetingNetworks[network]?.sticker &&
    stickers.length > 0
  ) {
    const sticker = stickers[randomIndex(random, stickers.length)];
    return { kind: 'sticker', sticker, text: null };
  }
  const texts =
    selection.texts?.[language] ?? selection.texts?.[selection.language] ?? [];
  if (texts.length === 0) {
    return null;
  }
  return {
    kind: 'text',
    sticker: null,
    text: texts[randomIndex(random, texts.length)],
  };
};

/**
 * Why a chat cannot be greeted right now, or null when it can.
 */
const blockedReason = (chat, now) => {
  const network = greetingNetworks[chat.network];
  if (!network) {
    return 'network-unsupported';
  }
  if (network.initiate === 'window') {
    const lastIncoming = chat.last && !chat.lastOutgoing ? chat.last : null;
    const since = lastIncoming ? now - timeOf(lastIncoming) : Infinity;
    if (since > network.windowHours * HOUR_MS) {
      return 'outside-messaging-window';
    }
  }
  return null;
};

const initiateCandidates = (chats, greeted, staleMs, now) =>
  chats
    .filter((chat) => !greeted.has(greetingLinkId(chat.network, chat.chat)))
    .filter(
      (chat) =>
        chat.outgoing === 0 ||
        (chat.lastOutgoing && now - timeOf(chat.last) > staleMs)
    )
    .sort(
      (a, b) =>
        Number(a.outgoing > 0) - Number(b.outgoing > 0) ||
        timeOf(a.last) - timeOf(b.last)
    );

const replyCandidates = (chats, stickerIds) =>
  chats
    .filter(
      (chat) =>
        chat.last &&
        !chat.lastOutgoing &&
        isGreetingMessage(chat.last, stickerIds)
    )
    .sort((a, b) => timeOf(b.last) - timeOf(a.last));

// A sticker or a bare wave says nothing about the language: 'und'.
const replyLanguage = (chat, mode, selection) =>
  mode === 'reply'
    ? (detectGreetingLanguage(chat.last.body) ?? 'und')
    : selection.language;

/** One chat's envelope: what to send, or why it is skipped. */
const planEnvelope = ({ chat, mode, selection, now, random }) => {
  const language = replyLanguage(chat, mode, selection);
  const reason = blockedReason(chat, now);
  const choice = reason
    ? null
    : chooseGreeting({
        selection,
        network: chat.network,
        language: language === 'und' ? selection.language : language,
        random,
      });
  return {
    network: chat.network,
    chat: chat.chat,
    contact: chat.contact,
    language,
    kind: choice?.kind ?? null,
    sticker: choice?.sticker ?? null,
    text: choice?.text ?? null,
    lastMessageAt: chat.last ? timeOf(chat.last) || null : null,
    ...(reason || !choice
      ? { skipped: reason ?? 'no-greeting-available' }
      : {}),
  };
};

/**
 * Plans one greeting per chat.
 *
 * @param {object} opts
 * @param {Array<object>} opts.links message links to plan from
 * @param {'initiate'|'reply'} [opts.mode]
 * @param {object} [opts.selection] see `normalizeGreetingSelection`
 * @param {Iterable<string>} [opts.greeted] `greeting:*` ids already sent
 * @param {string[]|null} [opts.networks] restrict to these networks
 * @param {string|string[]} [opts.me] sender ids that are the user
 * @param {number} [opts.limit] at most this many envelopes (vk-bot: 10)
 * @param {number} [opts.staleDays] re-greet chats silent this long
 * @param {number} [opts.now] clock, for tests
 * @param {() => number} [opts.random] RNG, for deterministic previews
 */
export const planGreetings = ({
  links,
  mode = 'initiate',
  selection = defaultGreetingSelection(),
  greeted = [],
  networks = null,
  me = null,
  limit = 10,
  staleDays = 30,
  now = Date.now(),
  random = Math.random,
} = {}) => {
  const greetedIds = new Set(greeted);
  const chats = summarizeChats(links, { me }).filter(
    (chat) => !networks || networks.includes(chat.network)
  );
  const candidates =
    mode === 'reply'
      ? replyCandidates(chats, knownGreetingStickerIds())
      : initiateCandidates(chats, greetedIds, staleDays * 24 * HOUR_MS, now);
  const envelopes = [];
  for (const chat of candidates) {
    if (envelopes.filter((e) => !e.skipped).length >= limit) {
      break;
    }
    envelopes.push(planEnvelope({ chat, mode, selection, now, random }));
  }
  return { mode, envelopes };
};

/**
 * `planGreetings` over everything the store holds: its message links,
 * the saved selection and the greetings already sent. Shared by the
 * HTTP API and the CLI so both plan from the same state.
 */
export const planFromStore = async (store, options = {}) =>
  planGreetings({
    ...options,
    links: await store.query((l) => l.id?.startsWith('msg:')),
    selection: await loadGreetingSelection(store),
    greeted: (await store.query((l) => l.id?.startsWith('greeting:'))).map(
      (l) => l.id
    ),
  });

/**
 * Secret links holding each network's credentials, named as in the
 * connection guides. Missing secrets fall back to the adapters'
 * environment variables (VK_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, …).
 */
const CREDENTIAL_SECRETS = {
  vk: { token: ['secret:vk:access-token', 'secret:vk:token'] },
  telegram: { token: ['secret:telegram:bot-token'] },
  whatsapp: {
    token: ['secret:whatsapp:access-token'],
    phoneNumberId: ['secret:whatsapp:phone-number-id'],
  },
  facebook: {
    token: ['secret:facebook:access-token'],
    pageId: ['secret:facebook:page-id'],
  },
};

const secretValue = async (store, ids) => {
  for (const id of ids) {
    const link = await store.get(id);
    const value = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (value) {
      return String(value);
    }
  }
  return null;
};

/** `{network: {token, phoneNumberId?, pageId?}}` from stored secrets. */
export const loadGreetingCredentials = async (store) => {
  const credentials = {};
  for (const [network, fields] of Object.entries(CREDENTIAL_SECRETS)) {
    const options = {};
    for (const [field, ids] of Object.entries(fields)) {
      const value = await secretValue(store, ids);
      if (value) {
        options[field] = value;
      }
    }
    credentials[network] = options;
  }
  return credentials;
};

const outgoingContent = (envelope) => ({
  chat: envelope.chat,
  to: envelope.chat,
  ...(envelope.kind === 'sticker'
    ? { sticker: { id: envelope.sticker.id, url: envelope.sticker.url } }
    : { text: envelope.text }),
});

/** Posts one envelope and records the greeting link. */
const sendEnvelope = async (
  envelope,
  { store, resolveSource, credentials, now }
) => {
  const live = resolveSource(envelope.network)?.live;
  if (!live?.post) {
    throw new Error(`${envelope.network} cannot send messages`);
  }
  const result = await live.post(
    outgoingContent(envelope),
    credentials[envelope.network] ?? {}
  );
  await store?.put({
    id: greetingLinkId(envelope.network, envelope.chat),
    tokens: ['greeting', envelope.network, envelope.chat],
    children: [`chat:${envelope.network}:${envelope.chat}`],
    kind: envelope.kind,
    sticker: envelope.sticker,
    text: envelope.text,
    sentAt: now(),
  });
  return result;
};

const defaultSleep = (ms) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

/**
 * Sends a plan's envelopes one by one through `live.post`. Successful
 * sends are recorded as `greeting:<network>:<chat>` links so the next
 * `initiate` plan skips them.
 *
 * @param {{envelopes: Array<object>}} plan
 * @param {object} [opts]
 * @param {object} [opts.store] where to record sent greetings
 * @param {(name: string) => object} [opts.resolveSource] for tests
 * @param {object} [opts.credentials] per-network `live.post` options
 * @param {number} [opts.delayMs] pause between sends (vk-bot: 30 s)
 */
export const runGreetings = async (
  plan,
  {
    store = null,
    resolveSource = getSource,
    credentials = {},
    delayMs = 0,
    sleep = defaultSleep,
    now = () => new Date().toISOString(),
  } = {}
) => {
  const results = [];
  let attempted = 0;
  for (const envelope of plan.envelopes ?? []) {
    if (envelope.skipped) {
      results.push({ ...envelope, ok: false, error: envelope.skipped });
      continue;
    }
    if (attempted > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    attempted += 1;
    try {
      const result = await sendEnvelope(envelope, {
        store,
        resolveSource,
        credentials,
        now,
      });
      results.push({ ...envelope, ok: true, result });
    } catch (err) {
      results.push({ ...envelope, ok: false, error: err.message });
    }
  }
  return results;
};

/**
 * Lists greeting stickers live from every network that can enumerate
 * them (VK keywords, Telegram sticker sets). Failures are reported per
 * network instead of failing the whole listing.
 */
export const listLiveGreetingStickers = async ({
  networks = ['vk', 'telegram'],
  selection = defaultGreetingSelection(),
  resolveSource = getSource,
  credentials = {},
} = {}) => {
  const stickers = [];
  const failures = [];
  for (const network of networks) {
    const live = resolveSource(network)?.live;
    if (!live?.listGreetingStickers) {
      failures.push({ network, error: 'listing-unsupported' });
      continue;
    }
    try {
      const listed = await live.listGreetingStickers({
        sets: network === 'telegram' ? selection.telegramSets : undefined,
        token: credentials[network]?.token ?? null,
      });
      stickers.push(...listed.stickers);
      failures.push(
        ...listed.failures.map((failure) => ({ network, ...failure }))
      );
    } catch (err) {
      failures.push({ network, error: err.message });
    }
  }
  return { stickers, failures };
};
