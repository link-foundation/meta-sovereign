/**
 * Greetings planning (issue #35): the browser-safe half of the
 * subsystem. Catalogue, detection, selection and the pure planner live
 * here; sending (`runGreetings`) and live listing live in `./index.js`,
 * which needs the network adapters.
 *
 * The SPA imports this module, not `./index.js`: the adapters include
 * code the page's Content Security Policy forbids (`new Function`), so
 * pulling them into the bundle stops the whole app from starting.
 */

import {
  builtInGreetingStickers,
  greetingNetworks,
  greetingTexts,
  telegramDefaultGreetings,
  telegramGreetingSets,
  vkIncomingGreetingStickerIds,
} from './catalog.js';
import { detectGreetingLanguage, isGreetingMessage } from './detect.js';
import {
  SETTINGS_ID,
  normalizeSettings,
  optOutEntry,
  unreachableReason,
} from '../automation/safety.js';

export * from './catalog.js';
export * from './detect.js';

export const GREETING_SELECTION_ID = 'greetings:selection';
export const greetingLinkId = (network, chat) => `greeting:${network}:${chat}`;

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_RULES = { business: [], settings: normalizeSettings() };

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
  unreachable: null,
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
    chat.unreachable ??= unreachableReason([link]);
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
 * Whether the network's messaging window applies to this send. WhatsApp's
 * 24-hour window is the Cloud API's (a business number); a personal
 * WhatsApp driven through the web app has no such limit (R-Z3), so it
 * applies only when `business` lists the network.
 */
const windowApplies = (chat, business) =>
  chat.network !== 'whatsapp' || business.includes('whatsapp');

/**
 * Why a chat cannot be greeted right now, or null when it can.
 */
const blockedReason = (chat, now, { business = [], settings }) => {
  const network = greetingNetworks[chat.network];
  if (!network) {
    return 'network-unsupported';
  }
  if (
    optOutEntry(settings, {
      source: chat.network,
      chat: chat.chat,
      contact: chat.contact,
    })
  ) {
    return 'opted-out';
  }
  if (chat.unreachable) {
    return chat.unreachable;
  }
  if (network.initiate === 'window' && windowApplies(chat, business)) {
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
const planEnvelope = ({ chat, mode, selection, now, random, rules }) => {
  const language = replyLanguage(chat, mode, selection);
  const reason = blockedReason(chat, now, rules);
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
 * @param {{business?: string[], settings?: object}} [opts.rules]
 *   `business`: networks sent through an official business API (the
 *   WhatsApp Cloud API): only these have the 24-hour window; `settings`:
 *   the automation settings (opt-out list)
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
  rules = DEFAULT_RULES,
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
    envelopes.push(planEnvelope({ chat, mode, selection, now, random, rules }));
  }
  return { mode, envelopes };
};

// WhatsApp is a business number (the Cloud API, with its 24-hour window)
// only when its token and phone-number id are saved; otherwise it is the
// personal app (R-Z3).
const secretSaved = async (store, id) => {
  const link = await store.get(id);
  return Boolean(link?.token ?? link?.value);
};

const businessNetworks = async (store) =>
  (await secretSaved(store, 'secret:whatsapp:access-token')) &&
  (await secretSaved(store, 'secret:whatsapp:phone-number-id'))
    ? ['whatsapp']
    : [];

/**
 * `planGreetings` over everything the store holds: its message links,
 * the saved selection and the greetings already sent. Shared by the
 * HTTP API and the CLI so both plan from the same state.
 */
export const planFromStore = async (store, options = {}) =>
  planGreetings({
    rules: {
      business: await businessNetworks(store),
      settings: normalizeSettings((await store.get(SETTINGS_ID)) ?? {}),
    },
    ...options,
    links: await store.query((l) => l.id?.startsWith('msg:')),
    selection: await loadGreetingSelection(store),
    greeted: (await store.query((l) => l.id?.startsWith('greeting:'))).map(
      (l) => l.id
    ),
  });
