/**
 * Sending as the user (MTProto), the way Telegram's own apps do it.
 *
 *   - Exactly once: every message carries a `random_id`. Telegram drops a
 *     second request with the same one (RANDOM_ID_DUPLICATE), so a retry
 *     after a lost answer never posts twice. It is derived from the
 *     composer's `clientId`, so a retry of the same draft reuses it.
 *   - Formatting as Telegram Desktop's: `**bold**`, `__italic__`,
 *     `~~strike~~`, `||spoiler||`, `` `code` ``, ```` ```pre``` ```` and
 *     `[text](link)` go as entities (./telegram-format.js); a lone `*` or
 *     `_` stays as typed.
 *   - Long text is split at Telegram's limit (`message_length_max` from
 *     the server's config, 4096 by default; UTF-16 units, like JS
 *     strings), on a line or word break when there is one, never inside
 *     an emoji, and sent in order.
 *   - Sending clears the chat's cloud draft (`clear_draft`), as Telegram
 *     Desktop always does.
 *   - "Send without sound" (`silent`) and "Schedule message"
 *     (`schedule_date`), as Desktop's Send button menu (R-Y102).
 *   - Telegram's errors become codes the composer can explain.
 */

import { createHash } from 'node:crypto';

import {
  apiEntities,
  parseFormatted,
  sliceFormatted,
} from './telegram-format.js';

export const MAX_MESSAGE_LENGTH = 4096;

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;

/**
 * Where to split text into Telegram-sized parts, preferring line/word
 * breaks: `[[start, end], …]` of the text (the break between two parts
 * is dropped).
 */
export const splitRanges = (text, max = MAX_MESSAGE_LENGTH) => {
  const all = String(text ?? '');
  const ranges = [];
  let start = 0;
  while (all.length - start > max) {
    const window = all.slice(start, start + max);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    // A break in the first half would leave a tiny part; cut hard instead,
    // but not between the two halves of an emoji (a surrogate pair).
    let at = cut > max / 2 ? cut : max;
    if (at === max && isHighSurrogate(all.charCodeAt(start + max - 1))) {
      at -= 1;
    }
    ranges.push([start, start + at]);
    start += at;
    if (all[start] === '\n' || all[start] === ' ') {
      start += 1;
    }
  }
  if (start < all.length || ranges.length === 0) {
    ranges.push([start, all.length]);
  }
  return ranges;
};

/** Split text into Telegram-sized parts, preferring line/word breaks. */
export const splitMessage = (text, max = MAX_MESSAGE_LENGTH) =>
  splitRanges(text, max).map(([start, end]) =>
    String(text ?? '').slice(start, end)
  );

/**
 * What is typed as Telegram's parts: the markdown made entities
 * (./telegram-format.js), then split at the limit, each part with its
 * own entities.
 */
export const formattedParts = (typed, max = MAX_MESSAGE_LENGTH) => {
  const formatted = parseFormatted(typed);
  return sliceFormatted(formatted, splitRanges(formatted.text, max));
};

/** A stable 64-bit random_id for part `index` of draft `clientId`. */
export const randomIdOf = (clientId, index, helpers) => {
  const seed = clientId ? `${clientId}:${index}` : `${Math.random()}:${index}`;
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 8);
  return helpers.readBigIntFromBuffer(bytes, true, true);
};

const errorText = (error) =>
  String(error?.errorMessage ?? error?.message ?? '');

const codeError = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, fallback: false, ...extra });

// A refused "send as" (R-Y141).
const refusedSendAs = (text) => {
  if (/SEND_AS_PEER_INVALID/.test(text)) {
    return codeError('send-as-invalid', text);
  }
  return /PREMIUM_ACCOUNT_REQUIRED/.test(text)
    ? codeError('premium-required', text)
    : null;
};

const otherSendError = (error) => {
  const text = errorText(error);
  const flood = /FLOOD_WAIT_?(\d+)?/.exec(text);
  if (flood) {
    const seconds = Number(error?.seconds ?? flood[1] ?? 0) || null;
    return codeError('flood-wait', text, { retryAfter: seconds });
  }
  if (
    /CHAT_WRITE_FORBIDDEN|CHAT_SEND_POLL_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED|USER_IS_BLOCKED|YOU_BLOCKED_USER|CHAT_SEND_PLAIN_FORBIDDEN/.test(
      text
    )
  ) {
    return codeError('write-forbidden', text);
  }
  if (
    /PEER_ID_INVALID|input entity|CHANNEL_PRIVATE|CHANNEL_INVALID/i.test(text)
  ) {
    return codeError('unknown-chat', text);
  }
  if (/MESSAGE_TOO_LONG|MEDIA_CAPTION_TOO_LONG/.test(text)) {
    return codeError('too-long', text);
  }
  if (/FILE_PARTS_INVALID|FILE_PART_TOO_BIG|FILE_TOO_BIG/.test(text)) {
    return codeError('too-large', text);
  }
  if (/MESSAGE_EMPTY/.test(text)) {
    return codeError('bad-draft', text);
  }
  // Anything else (network, auth): never retried through another channel
  // — a message that may already be sent must not be sent again.
  return codeError(error?.code ?? 'send-failed', text || 'send failed');
};

/** Telegram's error as a composer-friendly `{ code, retryAfter? }` error. */
export const sendError = (error) =>
  refusedSendAs(errorText(error)) ?? otherSendError(error);

// Whom the message answers, and the part of it quoted; in a forum
// topic (R-Y122), the topic: its first message answered when nothing
// else is, else named as the top one (General needs neither).
export const replyHeader = (Api, replyTo, replyQuote, topic = null) => {
  const inTopic = Number.isInteger(topic) && topic > 1;
  const answers = replyTo || (inTopic ? topic : null);
  return answers
    ? {
        replyTo: new Api.InputReplyToMessage({
          replyToMsgId: answers,
          ...(inTopic && replyTo && replyTo !== topic
            ? { topMsgId: topic }
            : {}),
          ...(replyTo && replyQuote ? { quoteText: replyQuote } : {}),
        }),
      }
    : {};
};

// A client without raw invoke (tests, other libraries).
const sendThroughLibrary = (
  client,
  peer,
  { text, formatting, replyTo, topic, when = {} }
) =>
  client.sendMessage(peer, {
    message: text,
    parseMode: false,
    ...(formatting.length > 0 ? { formattingEntities: formatting } : {}),
    ...(replyTo || topic > 1 ? { replyTo: replyTo ?? topic } : {}),
    ...(when.silent ? { silent: true } : {}),
    ...(when.scheduleDate ? { schedule: when.scheduleDate } : {}),
  });

// Without sound, and when (R-Y102): Telegram's `silent` and
// `schedule_date`.
const whenFields = ({ silent = false, scheduleDate = null } = {}) => ({
  ...(silent ? { silent: true } : {}),
  ...(scheduleDate ? { scheduleDate } : {}),
});

// The emoji Telegram's apps send as a die when sent alone (R-Y130).
export const DICE = Object.freeze(['🎲', '🎯', '🏀', '⚽', '🎳', '🎰']);

/** The die a message's whole text names, or null. */
export const diceOf = (text) => {
  const bare = String(text ?? '')
    .trim()
    .replaceAll('\uFE0F', '');
  return DICE.includes(bare) ? bare : null;
};

// What a part is sent as: a die (messages.sendMedia) for a lone die's
// emoji, else the text (messages.sendMessage).
const partRequest = (Api, { text, formatting, ...fields }) => {
  const dice = formatting.length === 0 && Api.InputMediaDice && diceOf(text);
  return dice
    ? new Api.messages.SendMedia({
        ...fields,
        media: new Api.InputMediaDice({ emoticon: dice }),
        message: '',
      })
    : new Api.messages.SendMessage({
        ...fields,
        message: text,
        ...(formatting.length > 0 ? { entities: formatting } : {}),
      });
};

// One part through messages.SendMessage, with our random_id. `onResult`
// sees Telegram's raw answer: it carries the update counter (pts) that
// the catch-up tracks, and GramJS does not pass RPC answers to the
// update handlers.
const sendPart = async ({
  client,
  Api,
  peer,
  text,
  entities = [],
  randomId,
  replyTo,
  replyQuote = null,
  topic,
  when,
  onResult,
}) => {
  const formatting = apiEntities(Api, entities);
  if (!Api?.messages?.SendMessage || typeof client.invoke !== 'function') {
    return sendThroughLibrary(client, peer, {
      text,
      formatting,
      replyTo,
      topic,
      when,
    });
  }
  const request = partRequest(Api, {
    text,
    formatting,
    peer: await client.getInputEntity(peer),
    randomId,
    clearDraft: true,
    ...whenFields(when),
    ...replyHeader(Api, replyTo, replyQuote, topic),
  });
  try {
    const result = await client.invoke(request);
    onResult?.(result);
    if (result?.className === 'UpdateShortSentMessage') {
      return { id: result.id, date: result.date };
    }
    return client._getResponseMessage?.(request, result, peer) ?? null;
  } catch (error) {
    if (/RANDOM_ID_DUPLICATE/.test(errorText(error))) {
      // Telegram already has this exact message (an earlier try got
      // through): it is sent, we just do not know its id here.
      return { id: null, duplicate: true };
    }
    throw error;
  }
};

/**
 * Send `text` to `peer`, part by part.
 * Returns `[{ id, date, text, entities, duplicate? }]`, one per part.
 */
export const sendText = async ({
  client,
  Api,
  helpers,
  peer,
  text,
  clientId,
  maxLength = MAX_MESSAGE_LENGTH,
  replyTo = null,
  replyQuote = null,
  topic = null,
  silent,
  scheduleDate,
  onResult,
}) => {
  const parts = formattedParts(text, maxLength);
  const sent = [];
  for (const [index, part] of parts.entries()) {
    const randomId = helpers ? randomIdOf(clientId, index, helpers) : undefined;
    const message = await sendPart({
      client,
      Api,
      peer,
      text: part.text,
      entities: part.entities,
      randomId,
      // A long reply answers with its first part, as Telegram's apps do.
      replyTo: index === 0 ? replyTo : null,
      replyQuote: index === 0 ? replyQuote : null,
      // Every part goes to the topic (R-Y122).
      topic,
      when: { silent, scheduleDate },
      onResult,
    });
    sent.push({
      id: message?.id ?? null,
      date: message?.date ?? null,
      text: part.text,
      entities: part.entities,
      ...(message?.duplicate ? { duplicate: true } : {}),
    });
  }
  return sent;
};
