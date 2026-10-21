/**
 * Re-engage dormant personal contacts (issue #31, R-X1..R-X9).
 *
 * The flow is: find every 1:1 conversation that has been silent for at
 * least `days` (90 by default), work out whether the two people used
 * "ты" or "вы" (see `./address-form.js`), render the matching template
 * and hand the drafts to a session that, by default, sends exactly one
 * message per explicit confirmation.
 *
 * Everything here is pure over a list of links, so the CLI, the server
 * and the SPA (fully offline) share one implementation. Sending is the
 * only side effect and it is injected.
 *
 * Every decision is written back to the store as a
 * `reengage:<source>:<chat>` link (`sent`, `skipped` or `failed`), so a
 * contact who was just messaged — or deliberately skipped — is not
 * offered again until the cooldown has passed.
 */

import {
  addressRulesFromPatterns,
  definedOnly,
  defaultAddressRules,
} from './address-form.js';
import { addressFormOf } from './person-learn.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DORMANT_DAYS = 90;
export const REENGAGE_PREFIX = 'reengage:';

/** The two texts from issue #31; callers pass their own. */
export const defaultReengageTemplates = Object.freeze({
  informal:
    'Привет\n\nТебе или твоим друзьям на текущий момент нужна помощь с автоматизацией? Есть открытые вакансии?',
  formal:
    'Здравствуйте\n\nВам или вашим друзьям на текущий момент нужна помощь с автоматизацией? Есть открытые вакансии?',
});

/**
 * `safe` (alias `debug`) prepares one message at a time and sends it
 * only after the user confirms it; `batch` may send the whole plan.
 */
export const REENGAGE_MODES = Object.freeze(['safe', 'debug', 'batch']);

export class SafeModeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SafeModeError';
    this.code = 'safe-mode';
  }
}

export const normalizeReengageMode = (mode) => {
  const value = String(mode ?? 'safe');
  if (!REENGAGE_MODES.includes(value)) {
    throw new Error(
      `unknown re-engage mode "${value}"; known: ${REENGAGE_MODES.join(', ')}`
    );
  }
  return value === 'debug' ? 'safe' : value;
};

// Chat types the adapters may carry: Telegram export (`personal_chat`,
// `bot_chat`, `saved_messages`, `*_group`, `*_channel`), the Bot API
// (`private`, `group`, `supergroup`, `channel`) and VK peer types.
const PERSONAL_CHAT_TYPES = new Set(['personal_chat', 'private', 'user']);

/** Whether an adapter's `chatType` names a one-to-one conversation. */
export const isPersonalChatType = (chatType) =>
  PERSONAL_CHAT_TYPES.has(chatType);

const toMs = (value) => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? null : parsed;
};

const chatKind = (source, chat, messages) => {
  const types = new Set(messages.map((m) => m.chatType).filter(Boolean));
  if ([...types].some(isPersonalChatType)) {
    return 'personal';
  }
  if (types.size > 0) {
    return 'group';
  }
  // VK peer ids: users are positive, multi-user chats start at 2e9 and
  // communities are negative (https://dev.vk.com/en/reference/objects/message).
  if (source === 'vk' && /^-?\d+$/.test(String(chat))) {
    const id = Number(chat);
    return id > 0 && id < 2e9 ? 'personal' : 'group';
  }
  return null;
};

/**
 * Which sender ids are the owner. `me` always is. With no explicit ids,
 * the sender present in the most chats of a source is taken to be the
 * owner — in a pile of 1:1 dialogs only the owner appears in all of
 * them — but only when that sender appears in at least two.
 */
export const detectSelfIds = (messages, explicit = []) => {
  const ids = new Set(['me', ...explicit.map(String).filter(Boolean)]);
  if (explicit.length > 0) {
    return ids;
  }
  const chatsBySender = new Map();
  for (const m of messages) {
    if (!m.sender) {
      continue;
    }
    const key = `${m.source}\u0000${m.sender}`;
    const chats = chatsBySender.get(key) ?? new Set();
    chats.add(String(m.chat));
    chatsBySender.set(key, chats);
  }
  const best = new Map();
  for (const [key, chats] of chatsBySender) {
    const [source, sender] = key.split('\u0000');
    const current = best.get(source);
    if (!current || chats.size > current.count) {
      best.set(source, { sender, count: chats.size });
    }
  }
  for (const { sender, count } of best.values()) {
    if (count >= 2) {
      ids.add(sender);
    }
  }
  return ids;
};

/** Messages grouped per `<source>:<chat>` conversation. */
export const groupByChat = (messages) => {
  const chats = new Map();
  for (const m of messages) {
    const key = `${m.source}:${m.chat}`;
    const entry = chats.get(key) ?? {
      key,
      source: m.source,
      chat: String(m.chat),
      messages: [],
    };
    entry.messages.push(m);
    chats.set(key, entry);
  }
  return [...chats.values()];
};

const lastMessage = (messages) => {
  let last = null;
  let lastMs = null;
  for (const m of messages) {
    const ms = toMs(m.timestamp);
    if (ms !== null && (lastMs === null || ms > lastMs)) {
      last = m;
      lastMs = ms;
    }
  }
  return last ? { message: last, ms: lastMs } : null;
};

const SORTERS = {
  messages: (a, b) =>
    b.messageCount - a.messageCount || a.daysSilent - b.daysSilent,
  silence: (a, b) => b.daysSilent - a.daysSilent,
  recent: (a, b) => a.daysSilent - b.daysSilent,
};

/**
 * The one other person in a 1:1 conversation (an entry of
 * `groupByChat`), or `null` for groups and chats nobody answered in.
 * A chat is personal when its adapter says so (`chatType`), or — when
 * it does not — when exactly one person besides the owner wrote in it.
 */
export const personalPartner = (entry, isSelf) => {
  const kind = chatKind(entry.source, entry.chat, entry.messages);
  const others = new Set(
    entry.messages.map((m) => m.sender).filter((s) => s && !isSelf(s))
  );
  const personal = kind === 'personal' || (kind === null && others.size === 1);
  return personal && others.size === 1 ? [...others][0] : null;
};

const describeChat = (entry, { isSelf, now, requireMutual }) => {
  const contact = personalPartner(entry, isSelf);
  const mine = entry.messages.filter((m) => isSelf(m.sender)).length;
  if (contact === null) {
    return null;
  }
  if (requireMutual && mine === 0) {
    return null;
  }
  const last = lastMessage(entry.messages);
  if (!last) {
    return null;
  }
  return {
    key: entry.key,
    source: entry.source,
    chat: entry.chat,
    contact,
    name:
      entry.messages.find((m) => m.chatName)?.chatName ??
      entry.messages.find((m) => !isSelf(m.sender) && m.senderName)
        ?.senderName ??
      null,
    lastAt: new Date(last.ms).toISOString(),
    lastFrom: isSelf(last.message.sender) ? 'me' : 'contact',
    daysSilent: Math.floor((now - last.ms) / DAY_MS),
    messageCount: entry.messages.length,
    mine,
    theirs: entry.messages.length - mine,
    messages: entry.messages,
  };
};

/**
 * Every personal conversation silent for at least `days` (see
 * `personalPartner` for what counts as personal). With `requireMutual`
 * (the default) the owner must have written at least once, so a
 * stranger's unanswered spam is not a "contact".
 */
export const findDormantContacts = (
  links = [],
  {
    now = Date.now(),
    days = DEFAULT_DORMANT_DAYS,
    self = [],
    networks = null,
    requireMutual = true,
    sort = 'messages',
  } = {}
) => {
  const nowMs = toMs(now) ?? Date.now();
  const messages = links.filter(
    (l) =>
      l?.id?.startsWith('msg:') &&
      l.chat !== undefined &&
      l.chat !== null &&
      (!networks || networks.includes(l.source))
  );
  const selfIds = detectSelfIds(messages, self);
  const isSelf = (sender) => selfIds.has(String(sender));
  const contacts = groupByChat(messages)
    .map((entry) => describeChat(entry, { isSelf, now: nowMs, requireMutual }))
    .filter((c) => c && c.daysSilent >= Number(days));
  contacts.sort(SORTERS[sort] ?? SORTERS.messages);
  return { contacts, selfIds: [...selfIds], isSelf };
};

/**
 * Fill a template. `{name}` becomes the contact's display name when the
 * adapter knows one; when it does not, the placeholder and the comma
 * before it disappear ("Привет, {name}!" → "Привет!").
 */
/** The first word of a display name ("Мария Б" → "Мария"). */
export const firstName = (name) =>
  String(name ?? '')
    .trim()
    .split(/\s+/u)[0] ?? '';

export const renderReengageText = (template, contact = {}) =>
  String(template ?? '')
    .replace(/\{(name|first|days|network)\}/g, (_m, key) => {
      if (key === 'name') {
        return contact.name ?? '';
      }
      if (key === 'first') {
        return firstName(contact.name);
      }
      if (key === 'days') {
        return String(contact.daysSilent ?? '');
      }
      return contact.source ?? '';
    })
    .replace(/[ \t]*,[ \t]*([!.?])/g, '$1')
    .replace(/[ \t]+([,!.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');

export const templateFor = (templates, form) =>
  templates?.[form] ??
  templates?.neutral ??
  templates?.formal ??
  templates?.informal ??
  '';

/**
 * A link that opens the conversation with the text already filled in,
 * where the platform documents one; `null` elsewhere (copy the text).
 *
 * - e-mail: RFC 6068 `mailto:<addr>?body=` (line breaks as %0D%0A).
 * - Telegram: `tg://user?id=<id>` opens the chat with that user (Bot
 *   API docs); the text still has to be pasted, because Telegram has no
 *   pre-fill parameter for a user chat.
 * - VK: `https://vk.com/im?sel=<peer>` opens the dialog with a user.
 */
export const prefillLinkFor = ({ source, contact, chat, text }) => {
  const id = String(contact ?? '');
  const peer = String(chat ?? id);
  if (source === 'email' && /^[^\s@]+@[^\s@]+$/.test(id)) {
    const body = encodeURIComponent(
      String(text ?? '').replace(/\r?\n/g, '\r\n')
    );
    return { url: `mailto:${id}?body=${body}`, prefillsText: true };
  }
  if (source === 'vk' && /^\d+$/.test(peer) && Number(peer) < 2e9) {
    return { url: `https://vk.com/im?sel=${peer}`, prefillsText: false };
  }
  const tg = source === 'telegram' ? id.match(/^(?:user)?(\d+)$/) : null;
  if (tg) {
    return { url: `tg://user?id=${tg[1]}`, prefillsText: false };
  }
  return null;
};

const recordsByKey = (links) => {
  const map = new Map();
  for (const l of links) {
    if (l?.id?.startsWith(REENGAGE_PREFIX)) {
      map.set(l.id.slice(REENGAGE_PREFIX.length), l);
    }
  }
  return map;
};

/** `reengage:<source>:<chat>` — the id of a contact's decision record. */
export const reengageRecordId = ({ source, chat }) =>
  `${REENGAGE_PREFIX}${source}:${chat}`;

export const buildReengageRecord = (
  draft,
  { status, at = new Date().toISOString(), text, result, error, manual } = {}
) => ({
  id: reengageRecordId(draft),
  tokens: ['reengage', draft.source, String(draft.chat), status],
  source: draft.source,
  chat: String(draft.chat),
  contact: draft.contact ?? null,
  status,
  at: typeof at === 'string' ? at : new Date(at).toISOString(),
  form: draft.form ?? null,
  text: text ?? draft.text ?? '',
  ...(manual ? { manual: true } : {}),
  ...(result !== undefined ? { result } : {}),
  ...(error ? { error } : {}),
});

/**
 * Build the drafts. Returns `{ drafts, excluded, ... }` where every
 * draft carries the evidence behind its "ты"/"вы" choice, so the user
 * can see why a form was picked before confirming it.
 */
const PLAN_DEFAULTS = {
  days: DEFAULT_DORMANT_DAYS,
  templates: defaultReengageTemplates,
  rules: [],
  fallbackForm: 'formal',
  limit: null,
  mode: 'safe',
};

const coolingReason = (record, nowMs, cooldownDays) => {
  const recordMs = toMs(record?.at);
  const recent =
    recordMs !== null && nowMs - recordMs < Number(cooldownDays) * DAY_MS;
  return recent && ['sent', 'skipped'].includes(record.status)
    ? `already-${record.status}`
    : null;
};

const draftFor = (contact, { isSelf, rules, opts }) => {
  const addressForm = addressFormOf(contact.messages, {
    isSelf,
    rules,
    fallback: opts.fallbackForm,
  });
  const { messages: _messages, ...summary } = contact;
  const text = renderReengageText(
    templateFor(opts.templates, addressForm.form),
    contact
  );
  return {
    id: reengageRecordId(contact),
    ...summary,
    form: addressForm.form,
    addressForm,
    text,
    prefill: prefillLinkFor({ ...contact, text }),
  };
};

export const planReengagement = (links = [], options = {}) => {
  const opts = { ...PLAN_DEFAULTS, ...definedOnly(options) };
  const nowMs = toMs(opts.now ?? Date.now()) ?? Date.now();
  const cooldownDays = opts.cooldownDays ?? opts.days;
  const mode = normalizeReengageMode(opts.mode);
  const { contacts, selfIds, isSelf } = findDormantContacts(links, {
    ...opts,
    now: nowMs,
  });
  const rules = [
    ...defaultAddressRules,
    ...addressRulesFromPatterns(links),
    ...opts.rules,
  ];
  const records = recordsByKey(links);
  const drafts = [];
  const excluded = [];
  for (const contact of contacts) {
    const record = records.get(contact.key);
    const reason = coolingReason(record, nowMs, cooldownDays);
    if (reason) {
      excluded.push({ key: contact.key, reason, at: record.at });
      continue;
    }
    drafts.push(draftFor(contact, { isSelf, rules, opts }));
  }
  const limit = Number(opts.limit);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    days: Number(opts.days),
    cutoff: new Date(nowMs - Number(opts.days) * DAY_MS).toISOString(),
    mode,
    selfIds,
    total: drafts.length,
    drafts: limit > 0 ? drafts.slice(0, limit) : drafts,
    excluded,
  };
};

/** Re-render a draft for the other form (the user overrides the guess). */
export const withAddressForm = (draft, form, templates) => {
  const text = renderReengageText(templateFor(templates, form), draft);
  return {
    ...draft,
    form,
    text,
    prefill: prefillLinkFor({ ...draft, text }),
  };
};

/**
 * Send one draft through the source adapter's `live.post`. An adapter
 * that cannot send raises instead of pretending it did.
 */
export const createAdapterSender =
  ({ getSource, options = {} }) =>
  async (draft) => {
    const live = getSource(draft.source)?.live;
    if (!live?.post) {
      throw new Error(
        `${draft.source} cannot send from here; copy the text, send it yourself and mark it as sent`
      );
    }
    return live.post(
      { chat: draft.chat, to: draft.contact, text: draft.text },
      options[draft.source] ?? {}
    );
  };

const emptyCounts = () => ({ sent: 0, skipped: 0, failed: 0 });

/**
 * Walk a plan one draft at a time.
 *
 * In `safe` mode (the default) the only way to send is `confirm()`,
 * which sends the current draft and nothing else; `sendAll()` refuses.
 * A failed send leaves the draft current so it can be retried, edited,
 * marked as sent by hand or skipped. `record(link)` persists every
 * decision (normally `store.put`).
 */
export const createReengageSession = ({
  drafts = [],
  mode = 'safe',
  send,
  record = async () => {},
  templates = defaultReengageTemplates,
  clock = () => new Date(),
} = {}) => {
  const resolvedMode = normalizeReengageMode(mode);
  const items = drafts.map((d) => ({ ...d }));
  const history = [];
  const counts = emptyCounts();
  let index = 0;

  const current = () => items[index] ?? null;
  const requireCurrent = () => {
    const draft = current();
    if (!draft) {
      throw new Error('re-engage session is finished');
    }
    return draft;
  };
  const settle = async (draft, status, extra = {}) => {
    const link = buildReengageRecord(draft, {
      status,
      at: clock().toISOString(),
      ...extra,
    });
    await record(link);
    counts[status] += 1;
    history.push(link);
    return link;
  };
  const advance = () => {
    index += 1;
    return current();
  };
  const sendCurrent = async () => {
    const draft = requireCurrent();
    if (typeof send !== 'function') {
      throw new Error('re-engage session has no sender; use markSent()');
    }
    try {
      const result = await send(draft);
      const link = await settle(draft, 'sent', { result: result ?? null });
      advance();
      return { status: 'sent', draft, record: link };
    } catch (error) {
      const link = await settle(draft, 'failed', { error: error.message });
      return { status: 'failed', draft, record: link, error: error.message };
    }
  };

  return {
    mode: resolvedMode,
    current,
    /** Replace the text of the current draft before confirming it. */
    edit(text) {
      const draft = requireCurrent();
      draft.text = String(text ?? '');
      draft.prefill = prefillLinkFor(draft);
      return draft;
    },
    /** Switch the current draft between "ты" and "вы". */
    setForm(form) {
      items[index] = withAddressForm(requireCurrent(), form, templates);
      return items[index];
    },
    /** Send the current draft — the one action safe mode allows. */
    confirm: sendCurrent,
    /** The user sent it in their own app; record it and move on. */
    async markSent() {
      const draft = requireCurrent();
      const link = await settle(draft, 'sent', { manual: true });
      advance();
      return { status: 'sent', draft, record: link };
    },
    async skip() {
      const draft = requireCurrent();
      const link = await settle(draft, 'skipped');
      advance();
      return { status: 'skipped', draft, record: link };
    },
    /** Batch mode only: send everything left, skipping past failures. */
    async sendAll() {
      if (resolvedMode !== 'batch') {
        throw new SafeModeError(
          'safe mode sends one message per confirmation; start the session with mode "batch" to send them all'
        );
      }
      const results = [];
      while (current()) {
        const outcome = await sendCurrent();
        results.push(outcome);
        if (outcome.status === 'failed') {
          advance();
        }
      }
      return results;
    },
    progress: () => ({
      total: items.length,
      position: Math.min(index, items.length),
      remaining: Math.max(items.length - index, 0),
      done: index >= items.length,
      ...counts,
    }),
    history: () => [...history],
    /** The current draft and every one after it, edits included. */
    pending: () => items.slice(index).map((d) => ({ ...d })),
  };
};
