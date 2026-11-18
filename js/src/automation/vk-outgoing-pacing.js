import { readVkOutgoingSettings } from './vk-outgoing-settings.js';
import { loadSettings, optOutEntry } from './safety.js';
import { safeMessage } from '../server/redact.js';

export const stopped = () =>
  Object.assign(new Error('VK outgoing queue stopped'), {
    code: 'stopped',
    definitive: true,
    fallback: false,
  });
const indicate = async (event, update, log) => {
  let status = 'confirmed';
  try {
    const result = await event.effect();
    if (result !== 1 && !(result?.supported === true && result.result === 1)) {
      status = 'unconfirmed';
    }
  } catch (error) {
    status = 'refused';
    log({
      event: 'vk_queue_indication_failed',
      kind: event.kind,
      error: safeMessage(error),
    });
  }
  await update({ [event.kind]: status });
};
export const paceVkOutgoing = async ({
  entry,
  policy,
  signal,
  update,
  store,
  sleep,
  random,
  log,
}) => {
  const between = (min, max) =>
    min + Math.floor(Math.min(Math.max(random(), 0), 1) * (max - min));
  const isSticker = Boolean(entry.draft.sticker);
  const sendAt = isSticker
    ? between(6000, 8000)
    : between(10000, 14000) +
      Math.floor(
        (String(entry.draft.text ?? '').length * 60) / policy.charsPerMinute
      ) *
        1000;
  const events = [];
  if (policy.markRead && entry.markRead) {
    events.push({
      at: between(2000, 4000),
      kind: 'read',
      effect: entry.markRead,
    });
  }
  if (!isSticker && policy.typing && entry.setTyping) {
    for (let at = between(6000, 8000); at < sendAt; at += 5000) {
      events.push({ at, kind: 'typing', effect: entry.setTyping });
    }
  }
  events.sort((a, b) => a.at - b.at);
  let elapsed = 0;
  for (const event of [...events, { at: sendAt }]) {
    await sleep(event.at - elapsed, signal);
    elapsed = event.at;
    await validateVkPacing({ entry, policy, signal, store });
    if (event.effect) {
      await indicate(event, update, log);
    }
  }
};

export const validateVkPacing = async ({ entry, policy, signal, store }) => {
  if (signal.aborted) {
    throw stopped();
  }
  await requireVkQueuePolicy(store, policy);
  if (optOutEntry(await loadSettings(store), entry.draft)) {
    throw Object.assign(new Error('This chat is on the opt-out list'), {
      code: 'opted-out',
      definitive: true,
      fallback: false,
    });
  }
  await entry.validate?.();
};

export const requireVkQueuePolicy = async (store, policy) => {
  if (
    JSON.stringify(await readVkOutgoingSettings(store)) !==
    JSON.stringify(policy)
  ) {
    throw Object.assign(new Error('VK queue settings changed; review again'), {
      code: 'review-required',
      definitive: true,
      fallback: false,
    });
  }
};
