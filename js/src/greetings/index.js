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
  OUTBOX_PREFIX,
  batchStopReason,
  guardedSend,
  outboxKey,
  transientStore,
} from '../automation/outbox.js';
import { defaultGreetingSelection, greetingLinkId } from './plan.js';

export * from './plan.js';
export { isRateLimit } from '../automation/outbox.js';

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

// What a mass send is allowed to do (R-Z3): pace, day, run and failures.
export const DEFAULT_DELAY_MS = 30_000;
export const MIN_DELAY_MS = 5_000;
export const GREETING_LIMITS = Object.freeze({
  dailyCap: 50,
  maxPerRun: 20,
  maxFailures: 3,
  jitter: 0.25,
});

const DAY = 24 * 60 * 60 * 1000;

// Chats greeted in the last day: the outbox (sending and unknown sends
// count) and the greeting links of earlier versions.
const greetedToday = async (store, now) => {
  if (!store) {
    return new Set();
  }
  const day = (value) => now - Date.parse(value) < DAY;
  const links = await store.query(
    (l) => l?.id?.startsWith(OUTBOX_PREFIX) || l?.id?.startsWith('greeting:')
  );
  return new Set(
    links
      .filter((l) =>
        l.id.startsWith('greeting:')
          ? day(l.sentAt)
          : l.kind === 'greeting' &&
            ['sending', 'sent', 'unknown'].includes(l.status) &&
            day(l.at)
      )
      .map((l) => `${l.network ?? l.source}:${l.chat}`)
  );
};

// A pause with jitter, never below the floor (R-Z3).
const pause = (delayMs, jitter, random) => {
  const base = Math.max(Number(delayMs) || 0, MIN_DELAY_MS);
  return Math.round(base * (1 + (random() - 0.5) * 2 * jitter));
};

/** Posts one envelope through the guarded send, then records the link. */
const sendEnvelope = async (
  envelope,
  { store, resolveSource, credentials, now, clock }
) => {
  const live = resolveSource(envelope.network)?.live;
  if (!live?.post) {
    throw new Error(`${envelope.network} cannot send messages`);
  }
  const outcome = await guardedSend({
    store: store ?? transientStore(),
    kind: 'greeting',
    owner: 'greeting',
    key: outboxKey({
      owner: 'greeting',
      source: envelope.network,
      chat: envelope.chat,
      now: clock().getTime(),
    }),
    draft: {
      source: envelope.network,
      chat: envelope.chat,
      contact: envelope.contact,
      text: envelope.text ?? `sticker:${envelope.sticker?.id ?? ''}`,
    },
    send: ({ automated }) =>
      live.post(outgoingContent(envelope), {
        ...(credentials[envelope.network] ?? {}),
        // WhatsApp refuses an automated personal send (R-Z9).
        ...(envelope.network === 'whatsapp' ? { automated } : {}),
      }),
    clock,
  });
  if (outcome.status !== 'sent') {
    return outcome;
  }
  // The greeting is out: a store that fails now never turns it into a
  // failure (the outbox already says "sent").
  try {
    await store?.put({
      id: greetingLinkId(envelope.network, envelope.chat),
      tokens: ['greeting', envelope.network, envelope.chat],
      children: [`chat:${envelope.network}:${envelope.chat}`],
      kind: envelope.kind,
      sticker: envelope.sticker,
      text: envelope.text,
      sentAt: now(),
    });
  } catch {
    // the outbox record is the truth
  }
  return outcome;
};

const defaultSleep = (ms) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

// Why an envelope will not go out in this run, or null (R-Z3). Shared by
// the dry-run preview and the real run, so the preview is exact.
const holdReason = (envelope, { used, room, perRun, seen }) => {
  if (envelope.skipped) {
    return envelope.skipped;
  }
  if (
    used.has(`${envelope.network}:${envelope.chat}`) ||
    seen.has(`${envelope.network}:${envelope.chat}`)
  ) {
    return 'greeted-today';
  }
  if (seen.size >= Math.min(room, perRun)) {
    return room <= perRun ? 'daily-cap' : 'run-limit';
  }
  return null;
};

const limitsOf = (options) => ({
  ...GREETING_LIMITS,
  ...Object.fromEntries(
    Object.entries(options).filter(([, v]) => Number.isFinite(v) && v >= 0)
  ),
});

/**
 * The exact list a run would send, and what it would hold back and why,
 * without sending or recording anything (R-Z3).
 */
export const previewGreetings = async (
  plan,
  {
    store = null,
    delayMs = DEFAULT_DELAY_MS,
    clock = () => new Date(),
    ...rest
  } = {}
) => {
  const limits = limitsOf({
    dailyCap: rest.dailyCap,
    maxPerRun: rest.maxPerRun,
    maxFailures: rest.maxFailures,
  });
  const used = await greetedToday(store, clock().getTime());
  const room = Math.max(limits.dailyCap - used.size, 0);
  const seen = new Set();
  const willSend = [];
  const held = [];
  for (const envelope of plan.envelopes ?? []) {
    const reason = holdReason(envelope, {
      used,
      room,
      perRun: limits.maxPerRun,
      seen,
    });
    if (reason) {
      held.push({ ...envelope, held: reason });
    } else {
      seen.add(`${envelope.network}:${envelope.chat}`);
      willSend.push(envelope);
    }
  }
  return {
    dryRun: true,
    mode: plan.mode,
    willSend,
    held,
    limits: {
      dailyCap: limits.dailyCap,
      maxPerRun: limits.maxPerRun,
      maxFailures: limits.maxFailures,
      remainingToday: room,
      delayMs: Math.max(Number(delayMs) || 0, MIN_DELAY_MS),
    },
  };
};

// One send; an exception becomes a failed outcome, never a crash.
const attempt = (envelope, options) =>
  sendEnvelope(envelope, {
    store: options.store ?? null,
    resolveSource: options.resolveSource ?? getSource,
    credentials: options.credentials ?? {},
    now: options.now ?? (() => new Date().toISOString()),
    clock: options.clock ?? (() => new Date()),
  }).catch((err) => ({
    status: 'failed',
    error: err.message,
    code: err.code,
  }));

const failureOf = (envelope, outcome) => ({
  ...envelope,
  ok: false,
  status: outcome.status,
  error: outcome.error,
  ...(outcome.code ? { code: outcome.code } : {}),
});

/**
 * Sends a plan's envelopes one by one through the guarded send. Each
 * goes out once (outbox), at a paced and jittered pace, up to the daily
 * cap and the per-run maximum; the whole batch stops on a rate-limit
 * answer or after `maxFailures` failures in a row (R-Z3). Successful
 * sends are also recorded as `greeting:<network>:<chat>` links so the
 * next `initiate` plan skips them.
 *
 * @param {{envelopes: Array<object>}} plan
 * @param {object} [opts]
 * @param {object} [opts.store] where to record sent greetings
 * @param {(name: string) => object} [opts.resolveSource] for tests
 * @param {object} [opts.credentials] per-network `live.post` options
 * @param {number} [opts.delayMs] pause between sends (vk-bot: 30 s)
 * @param {number} [opts.dailyCap] most greetings per day
 * @param {number} [opts.maxPerRun] most greetings per request
 * @param {number} [opts.maxFailures] failures in a row that stop the batch
 */
export const runGreetings = async (plan, options = {}) => {
  const {
    store = null,
    delayMs = DEFAULT_DELAY_MS,
    sleep = defaultSleep,
    random = Math.random,
    clock = () => new Date(),
  } = options;
  const limits = limitsOf({
    dailyCap: options.dailyCap,
    maxPerRun: options.maxPerRun,
    maxFailures: options.maxFailures,
  });
  const used = await greetedToday(store, clock().getTime());
  const room = Math.max(limits.dailyCap - used.size, 0);
  const results = [];
  const seen = new Set();
  let failures = 0;
  let stopped = null;
  for (const envelope of plan.envelopes ?? []) {
    const held =
      stopped ??
      holdReason(envelope, { used, room, perRun: limits.maxPerRun, seen });
    if (held) {
      results.push({ ...envelope, ok: false, error: held, skipped: held });
      continue;
    }
    if (seen.size > 0) {
      await sleep(pause(delayMs, limits.jitter, random));
    }
    seen.add(`${envelope.network}:${envelope.chat}`);
    const outcome = await attempt(envelope, options);
    if (outcome.status === 'sent') {
      failures = 0;
      results.push({ ...envelope, ok: true, result: outcome.result });
      continue;
    }
    failures += 1;
    results.push(failureOf(envelope, outcome));
    const why = batchStopReason(outcome, failures, limits.maxFailures);
    stopped = why ? `batch-stopped:${why}` : null;
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
