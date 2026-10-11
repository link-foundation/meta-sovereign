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
import { defaultGreetingSelection, greetingLinkId } from './plan.js';

export * from './plan.js';

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
