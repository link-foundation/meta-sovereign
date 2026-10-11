/**
 * Automations (issue #31, PR #34): user-configurable rules of the form
 * "trigger → audience → conditions → action", after the triggers of
 * https://github.com/konard/vk-bot (`{ name, condition, action }` run on
 * new messages or on a schedule) and the daily caps, de-duplication
 * ledger and confirm-before-send habits of
 * https://github.com/konard/hh-job-application-automation.
 *
 * An automation is stored as an `automation:<id>` link:
 *
 *   triggers    [{ kind: 'manual' }]               run on demand (selected
 *                                                  people, an audience)
 *               [{ kind: 'chat-menu' }]            offered in every chat's menu
 *               [{ kind: 'schedule', every: '1d' }]
 *               [{ kind: 'incoming', pattern, flags }]
 *   audience    a people.js audience spec or its text form; defaults to
 *               everyone we have a personal chat with
 *   conditions  { silentDays, mutual, personal, lastFrom, networks,
 *                 cooldownDays }
 *   action      { kind: 'send-template', templates: { informal, formal,
 *                 neutral? }, form: 'auto' | 'informal' | 'formal' }
 *   mode        'safe' — every message is a draft the user confirms in the
 *               chat; 'auto' — sent with typing and human-like pauses
 *   pacing      { minDelayMs, maxDelayMs, typing, charsPerMinute,
 *                 maxTypingMs, dailyCap }
 *   limit       most messages per run
 *
 * Re-engaging dormant contacts (the original ask of issue #31) is just the
 * `reengage-dormant` preset. Everything here is pure over a list of links;
 * sending lives in `./runner.js`.
 */

import {
  addressRulesFromPatterns,
  defaultAddressRules,
  detectAddressForm,
} from '../crm/address-form.js';
import {
  DAY_MS,
  defaultReengageTemplates,
  findDormantContacts,
  prefillLinkFor,
  renderReengageText,
  templateFor,
} from '../crm/reengage.js';

export const AUTOMATION_PREFIX = 'automation:';
export const DRAFT_PREFIX = 'automation-draft:';
export const RUN_PREFIX = 'automation-run:';
export const STATE_PREFIX = 'automation-state:';
export const TRIGGER_KINDS = Object.freeze([
  'manual',
  'chat-menu',
  'schedule',
  'incoming',
]);
export const AUTOMATION_MODES = Object.freeze(['safe', 'auto']);
export const ADDRESS_CHOICES = Object.freeze(['auto', 'informal', 'formal']);

export const DEFAULT_PACING = Object.freeze({
  minDelayMs: 20_000,
  maxDelayMs: 60_000,
  typing: true,
  // vk-bot types at 450 characters per minute.
  charsPerMinute: 450,
  maxTypingMs: 8_000,
  dailyCap: 50,
});

const DEFAULT_CONDITIONS = Object.freeze({
  silentDays: 0,
  mutual: true,
  personal: true,
  lastFrom: 'any',
  networks: null,
  cooldownDays: null,
});

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS };

/** `'90m'`, `'12h'`, `'1d'`, `'2w'` or a number of milliseconds. */
export const parseDuration = (value) => {
  if (typeof value === 'number' && value > 0) {
    return value;
  }
  const match = String(value ?? '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/i);
  if (!match) {
    throw new Error(`bad duration "${value}"; use e.g. 30m, 12h, 1d, 2w`);
  }
  return Number(match[1]) * UNITS[match[2].toLowerCase()];
};

const slug = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'automation';

const normalizeTrigger = (trigger) => {
  const kind = String(trigger?.kind ?? 'manual');
  if (!TRIGGER_KINDS.includes(kind)) {
    throw new Error(
      `unknown trigger "${kind}"; known: ${TRIGGER_KINDS.join(', ')}`
    );
  }
  if (kind === 'schedule') {
    parseDuration(trigger.every);
    return { kind, every: trigger.every };
  }
  if (kind === 'incoming') {
    const pattern = String(trigger.pattern ?? '');
    const flags = String(trigger.flags ?? 'iu');
    new RegExp(pattern, flags);
    return { kind, pattern, flags };
  }
  return { kind };
};

const normalizeAction = (action = {}) => {
  const kind = action.kind ?? 'send-template';
  if (kind !== 'send-template') {
    throw new Error(`unknown action "${kind}"; known: send-template`);
  }
  const form = action.form ?? 'auto';
  if (!ADDRESS_CHOICES.includes(form)) {
    throw new Error(`unknown address form "${form}"`);
  }
  const templates = Object.fromEntries(
    Object.entries(action.templates ?? defaultReengageTemplates).filter(
      ([key, text]) =>
        ['informal', 'formal', 'neutral'].includes(key) &&
        String(text ?? '').trim()
    )
  );
  if (Object.keys(templates).length === 0) {
    throw new Error('the send-template action needs at least one template');
  }
  return {
    kind,
    templates,
    form,
    fallbackForm: action.fallbackForm ?? 'formal',
  };
};

const normalizeMode = (mode = 'safe') => {
  if (!AUTOMATION_MODES.includes(mode)) {
    throw new Error(
      `unknown mode "${mode}"; known: ${AUTOMATION_MODES.join(', ')}`
    );
  }
  return mode;
};

const triggersOf = (input) =>
  (
    input.triggers ?? (input.trigger ? [input.trigger] : [{ kind: 'manual' }])
  ).map(normalizeTrigger);

/** Fill defaults and validate; throws a readable Error on bad input. */
export const normalizeAutomation = (input = {}) => {
  const name = String(input.name ?? '').trim() || 'Automation';
  const id =
    String(input.id ?? '').replace(AUTOMATION_PREFIX, '') || slug(name);
  return {
    id: `${AUTOMATION_PREFIX}${id}`,
    tokens: ['automation', id],
    name,
    description: String(input.description ?? ''),
    enabled: input.enabled !== false,
    preset: input.preset ?? null,
    triggers: triggersOf(input),
    audience: input.audience ?? { kind: 'personal' },
    conditions: { ...DEFAULT_CONDITIONS, ...input.conditions },
    action: normalizeAction(input.action),
    mode: normalizeMode(input.mode),
    pacing: { ...DEFAULT_PACING, ...input.pacing },
    limit: Number(input.limit ?? 20),
  };
};

export const automationKey = (automation) =>
  String(automation?.id ?? automation).replace(AUTOMATION_PREFIX, '');

export const hasTrigger = (automation, kind) =>
  automation.triggers.some((t) => t.kind === kind);

/** The `incoming` trigger whose pattern matches `text`, if any. */
export const incomingTrigger = (automation, text) =>
  automation.triggers.find(
    (t) =>
      t.kind === 'incoming' &&
      new RegExp(t.pattern, t.flags).test(String(text ?? ''))
  ) ?? null;

const PRESET_TEXTS = {
  jobs: {
    informal:
      'Привет!\n\nЯ сейчас открыт к новым проектам и вакансиям в автоматизации и разработке. Если у тебя или твоих друзей есть что-то подходящее — буду рад подробностям.',
    formal:
      'Здравствуйте!\n\nЯ сейчас открыт к новым проектам и вакансиям в автоматизации и разработке. Если у Вас или Ваших коллег есть что-то подходящее — буду рад подробностям.',
  },
  contracts: {
    informal:
      'Привет!\n\nБеру проекты на контракт: автоматизация процессов, боты, интеграции. Если тебе или знакомым это может пригодиться — напиши, обсудим.',
    formal:
      'Здравствуйте!\n\nБеру проекты на контракт: автоматизация процессов, боты, интеграции. Если Вам или Вашим коллегам это может пригодиться — напишите, обсудим.',
  },
  greeting: {
    informal: 'Привет! Рад тебя слышать, как дела?',
    formal: 'Здравствуйте! Рад Вас слышать, чем могу помочь?',
  },
};

/**
 * Ready-made automations the user starts from and changes freely. The
 * first one is issue #31's request: say hi to every personal contact we
 * have not talked to for 90 days, "ты" or "вы" detected, one confirmed
 * message at a time.
 */
export const automationPresets = () =>
  [
    {
      id: 'reengage-dormant',
      preset: 'reengage-dormant',
      name: 'Say hi to contacts silent for 90 days',
      description:
        'Personal chats with no messages for 90 days get a hello asking whether they or their friends need help with automation.',
      triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }],
      conditions: { silentDays: 90, mutual: true },
      action: { templates: defaultReengageTemplates },
    },
    {
      id: 'job-search',
      preset: 'job-search',
      name: 'Ask about open positions',
      description:
        'Tell contacts you are open to new roles; pair with an audience of colleagues or recruiters.',
      triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }],
      conditions: { silentDays: 30, mutual: true },
      action: { templates: PRESET_TEXTS.jobs },
      pacing: { dailyCap: 30 },
    },
    {
      id: 'contract-search',
      preset: 'contract-search',
      name: 'Offer contract work',
      description:
        'Let contacts know you take contract projects; intersect lists to reach exactly the right people.',
      triggers: [{ kind: 'manual' }, { kind: 'chat-menu' }],
      conditions: { silentDays: 30, mutual: true },
      action: { templates: PRESET_TEXTS.contracts },
      pacing: { dailyCap: 30 },
    },
    {
      id: 'greet-back',
      preset: 'greet-back',
      name: 'Greet back',
      description:
        'When someone says hi in a personal chat, draft a greeting in the right form (at most once a day).',
      enabled: false,
      triggers: [
        // `\b` only knows ASCII letters, so end the word explicitly.
        {
          kind: 'incoming',
          pattern: '^(привет|здравствуй\\p{L}*|hi|hello)(?![\\p{L}\\p{N}])',
        },
        { kind: 'chat-menu' },
      ],
      conditions: { mutual: false, cooldownDays: 1 },
      action: { templates: PRESET_TEXTS.greeting },
    },
  ].map(normalizeAutomation);

// ---- planning --------------------------------------------------------

const toMs = (value) => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isNaN(ms) ? null : ms;
};

/** `automation-run:<automation>:<source>:<chat>`. */
export const runRecordId = (automation, { source, chat }) =>
  `${RUN_PREFIX}${automationKey(automation)}:${source}:${chat}`;

/** `automation-draft:<automation>:<source>:<chat>`. */
export const draftId = (automation, { source, chat }) =>
  `${DRAFT_PREFIX}${automationKey(automation)}:${source}:${chat}`;

const byId = (links, prefix) =>
  new Map(links.filter((l) => l?.id?.startsWith(prefix)).map((l) => [l.id, l]));

/** A conversation that is not 1:1 — offered from a group chat's menu. */
const groupCandidate = (links, { source, chat }, { isSelf, now }) => {
  const messages = links.filter(
    (l) =>
      l?.id?.startsWith('msg:') &&
      l.source === source &&
      String(l.chat) === String(chat)
  );
  const lastMs = Math.max(...messages.map((m) => toMs(m.timestamp) ?? 0), 0);
  const mine = messages.filter((m) => isSelf(m.sender)).length;
  return {
    key: `${source}:${chat}`,
    source,
    chat: String(chat),
    contact: null,
    name: messages.find((m) => m.chatName)?.chatName ?? null,
    personal: false,
    lastAt: lastMs ? new Date(lastMs).toISOString() : null,
    lastFrom: null,
    daysSilent: lastMs ? Math.floor((now - lastMs) / DAY_MS) : Infinity,
    messageCount: messages.length,
    mine,
    theirs: messages.length - mine,
    messages,
  };
};

/** Someone known only from an audience (a friend we never wrote to). */
const personCandidate = (person) => ({
  key: `${person.source}:${person.personalChat ?? person.user}`,
  source: person.source,
  chat: String(person.personalChat ?? person.user),
  contact: String(person.user),
  name: person.name ?? null,
  personal: true,
  lastAt: null,
  lastFrom: null,
  daysSilent: Infinity,
  messageCount: 0,
  mine: 0,
  theirs: 0,
  messages: [],
});

const pickCandidates = (links, automation, ctx) => {
  const personal = new Map(ctx.contacts.map((c) => [c.key, c]));
  if (ctx.targets) {
    return ctx.targets.map(
      (t) =>
        personal.get(`${t.source}:${t.chat}`) ?? groupCandidate(links, t, ctx)
    );
  }
  if (!ctx.resolveAudience) {
    return ctx.contacts;
  }
  const people = ctx.resolveAudience(links, automation.audience, {
    self: ctx.self,
  });
  return people.map(
    (p) =>
      personal.get(`${p.source}:${p.personalChat ?? p.user}`) ??
      personCandidate(p)
  );
};

const conditionReason = (candidate, c) => {
  if (c.networks?.length && !c.networks.includes(candidate.source)) {
    return 'network';
  }
  if (c.personal && candidate.personal === false) {
    return 'not-personal';
  }
  if (c.mutual && candidate.mine === 0) {
    return 'not-mutual';
  }
  if (candidate.daysSilent < Number(c.silentDays ?? 0)) {
    return 'talked-recently';
  }
  if (c.lastFrom !== 'any' && candidate.lastFrom !== c.lastFrom) {
    return `last-from-${candidate.lastFrom ?? 'nobody'}`;
  }
  return null;
};

/** A draft waiting, or a send/skip still inside the cooldown. */
const ledgerReason = (candidate, automation, ctx) => {
  if (ctx.drafts.has(draftId(automation, candidate))) {
    return 'draft-pending';
  }
  const c = automation.conditions;
  const record = ctx.records.get(runRecordId(automation, candidate));
  const cooldownMs = Number(c.cooldownDays ?? c.silentDays ?? 0) * DAY_MS;
  const recordMs = toMs(record?.at);
  const cooling =
    recordMs !== null &&
    ['sent', 'skipped'].includes(record.status) &&
    ctx.now - recordMs < cooldownMs;
  return cooling ? `already-${record.status}` : null;
};

const exclusionReason = (candidate, automation, ctx) =>
  conditionReason(candidate, automation.conditions) ??
  ledgerReason(candidate, automation, ctx);

/** Render the action's text for one candidate, "ты"/"вы" detected. */
export const draftFor = (automation, candidate, { isSelf, rules }) => {
  const { action } = automation;
  const addressForm =
    action.form === 'auto'
      ? detectAddressForm(candidate.messages, {
          isSelf,
          rules,
          fallback: action.fallbackForm,
        })
      : { form: action.form, reason: 'chosen' };
  const { messages: _messages, ...summary } = candidate;
  const text = renderReengageText(
    templateFor(action.templates, addressForm.form),
    candidate
  );
  return {
    ...summary,
    id: draftId(automation, candidate),
    automation: automation.id,
    automationName: automation.name,
    form: addressForm.form,
    addressForm,
    text,
    prefill: prefillLinkFor({ ...candidate, text }),
  };
};

/** Re-render a draft in the other form when the user overrides it. */
export const redraftWithForm = (automation, draft, form) => {
  const text = renderReengageText(
    templateFor(automation.action.templates, form),
    draft
  );
  return { ...draft, form, text, prefill: prefillLinkFor({ ...draft, text }) };
};

/**
 * Who the automation would message now, and why everyone else is left
 * out. `targets` (`[{ source, chat }]`) narrows it to chosen chats — the
 * chat menu and "run on selected people"; otherwise the audience is
 * resolved with `resolveAudience(links, spec)` (people.js).
 */
export const planAutomation = (links = [], input, options = {}) => {
  const automation = normalizeAutomation(input);
  const now = toMs(options.now) ?? Number(options.now ?? Date.now());
  const { contacts, selfIds, isSelf } = findDormantContacts(links, {
    now,
    days: 0,
    self: options.self ?? [],
    requireMutual: false,
  });
  const ctx = {
    now,
    isSelf,
    self: options.self ?? [],
    contacts: contacts.map((c) => ({ ...c, personal: true })),
    targets: options.targets ?? null,
    resolveAudience: options.resolveAudience ?? null,
    drafts: byId(links, DRAFT_PREFIX),
    records: byId(links, RUN_PREFIX),
  };
  const rules = [...defaultAddressRules, ...addressRulesFromPatterns(links)];
  const drafts = [];
  const excluded = [];
  const seen = new Set();
  for (const candidate of pickCandidates(links, automation, ctx)) {
    if (seen.has(candidate.key)) {
      continue;
    }
    seen.add(candidate.key);
    const reason = exclusionReason(candidate, automation, ctx);
    if (reason) {
      excluded.push({ key: candidate.key, name: candidate.name, reason });
    } else {
      drafts.push(draftFor(automation, candidate, { isSelf, rules }));
    }
  }
  const limit = Number(options.limit ?? automation.limit);
  return {
    automation: automation.id,
    name: automation.name,
    mode: automation.mode,
    generatedAt: new Date(now).toISOString(),
    selfIds: [...selfIds],
    total: drafts.length,
    drafts: limit > 0 ? drafts.slice(0, limit) : drafts,
    excluded,
  };
};
