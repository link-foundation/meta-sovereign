/**
 * Sending as the user (MTProto), the way Telegram's own apps do it.
 *
 *   - Exactly once: every message carries a `random_id`. Telegram drops a
 *     second request with the same one (RANDOM_ID_DUPLICATE), so a retry
 *     after a lost answer never posts twice. It is derived from the
 *     composer's `clientId`, so a retry of the same draft reuses it.
 *   - Plain text: what was typed is what is sent (no markdown parsing
 *     eating `*` and `_`).
 *   - Long text is split at 4096 characters (Telegram's limit), on a line
 *     or word break when there is one, and sent in order.
 *   - Telegram's errors become codes the composer can explain.
 */

import { createHash } from 'node:crypto';

export const MAX_MESSAGE_LENGTH = 4096;

/** Split text into Telegram-sized parts, preferring line/word breaks. */
export const splitMessage = (text, max = MAX_MESSAGE_LENGTH) => {
  const parts = [];
  let rest = String(text ?? '');
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    // A break in the first half would leave a tiny part; cut hard instead.
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^[\n ]/, '');
  }
  if (rest.length > 0 || parts.length === 0) {
    parts.push(rest);
  }
  return parts;
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

/** Telegram's error as a composer-friendly `{ code, retryAfter? }` error. */
export const sendError = (error) => {
  const text = errorText(error);
  const flood = /FLOOD_WAIT_?(\d+)?/.exec(text);
  if (flood) {
    const seconds = Number(error?.seconds ?? flood[1] ?? 0) || null;
    return codeError('flood-wait', text, { retryAfter: seconds });
  }
  if (
    /CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED|USER_IS_BLOCKED|YOU_BLOCKED_USER|CHAT_SEND_PLAIN_FORBIDDEN/.test(
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
  if (/MESSAGE_TOO_LONG/.test(text)) {
    return codeError('too-long', text);
  }
  if (/MESSAGE_EMPTY/.test(text)) {
    return codeError('bad-draft', text);
  }
  // Anything else (network, auth): never retried through another channel
  // — a message that may already be sent must not be sent again.
  return codeError(error?.code ?? 'send-failed', text || 'send failed');
};

// One part through messages.SendMessage, with our random_id.
const sendPart = async ({ client, Api, peer, text, randomId }) => {
  if (!Api?.messages?.SendMessage || typeof client.invoke !== 'function') {
    // A client without raw invoke (tests, other libraries).
    return client.sendMessage(peer, { message: text, parseMode: false });
  }
  const request = new Api.messages.SendMessage({
    peer: await client.getInputEntity(peer),
    message: text,
    randomId,
  });
  try {
    const result = await client.invoke(request);
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
 * Returns `[{ id, date, text, duplicate? }]`, one per part.
 */
export const sendText = async ({
  client,
  Api,
  helpers,
  peer,
  text,
  clientId,
}) => {
  const parts = splitMessage(text);
  const sent = [];
  for (const [index, part] of parts.entries()) {
    const randomId = helpers ? randomIdOf(clientId, index, helpers) : undefined;
    const message = await sendPart({ client, Api, peer, text: part, randomId });
    sent.push({
      id: message?.id ?? null,
      date: message?.date ?? null,
      text: part,
      ...(message?.duplicate ? { duplicate: true } : {}),
    });
  }
  return sent;
};
