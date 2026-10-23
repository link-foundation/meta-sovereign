/**
 * Voice and video note transcription, as Telegram Desktop's "→A" button
 * has it (R-Y175; learned, never copied):
 * - `transcribeAudio({ chat, id })` — messages.transcribeAudio on the
 *   message → `{ ok, transcriptionId, text, pending, trialRemains?,
 *   trialUntil? }`. While `pending` the text is what is known so far and
 *   the final one comes as updateTranscribedAudio (`transcriptWriter`
 *   below keeps it as a `transcript:telegram:<chat>:<id>` link the page
 *   follows) or by asking again. Non-Premium accounts get a trial: how
 *   many free ones remain and, when none, the date the next is free;
 * - `rateTranscription({ chat, id, transcriptionId, good })` —
 *   messages.rateTranscribedAudio.
 * Telegram's refusals (Premium needed, the transcription failed, a flood
 * wait) become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const SOURCE = 'telegram';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  TRANSCRIPTION_FAILED: 'transcription-failed',
  MSG_ID_INVALID: 'not-found',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const NUMBER = /^\d{1,20}$/;
const MAX_KEPT = 500;

/** The link that keeps one message's transcription. */
export const transcriptLinkId = (chat, id) =>
  `transcript:${SOURCE}:${chat}:${id}`;

// Telegram's answer, as the page reads it.
const shapeOf = (answer) => ({
  transcriptionId: String(answer.transcriptionId),
  text: String(answer.text ?? ''),
  pending: Boolean(answer.pending),
  ...(answer.trialRemainsNum === undefined
    ? {}
    : {
        trialRemains: Number(answer.trialRemainsNum),
        trialUntil: Number(answer.trialRemainsUntilDate) || null,
      }),
});

const linkOf = (chat, id, shape, now) => ({
  id: transcriptLinkId(chat, id),
  tokens: ['transcript', SOURCE, String(chat), String(id)],
  kind: 'transcript',
  source: SOURCE,
  chat: String(chat),
  msgId: Number(id),
  ...shape,
  at: new Date(now()).toISOString(),
});

/**
 * An updateTranscribedAudio kept: the message's transcript link takes the
 * text. True when it changed.
 */
export const transcriptWriter = async (store, effect, now = Date.now) => {
  if (!effect.id || !effect.chat) {
    return false;
  }
  const before = await store.get(transcriptLinkId(effect.chat, effect.id));
  const shape = {
    transcriptionId: String(effect.transcriptionId),
    text: String(effect.text ?? ''),
    pending: Boolean(effect.pending),
    // The trial counts stay from the call that asked.
    ...(before?.trialRemains === undefined
      ? {}
      : { trialRemains: before.trialRemains, trialUntil: before.trialUntil }),
  };
  if (
    before &&
    before.transcriptionId === shape.transcriptionId &&
    before.text === shape.text &&
    before.pending === shape.pending
  ) {
    return false;
  }
  await store.put(linkOf(effect.chat, effect.id, shape, now));
  return true;
};

const validAsk = ({ chat, id } = {}) =>
  CHAT.test(String(chat ?? '')) && Number.isInteger(id) && id > 0;

const validRate = (body = {}) =>
  validAsk(body) &&
  NUMBER.test(String(body.transcriptionId ?? '')) &&
  typeof body.good === 'boolean';

export const createTranscribe = (env, { userClient, now = Date.now }) => {
  const kept = new Map(); // chat:id -> shape
  const keep = (key, shape) => {
    kept.delete(key);
    kept.set(key, shape);
    if (kept.size > MAX_KEPT) {
      kept.delete(kept.keys().next().value);
    }
  };

  const transcribeAudio = async (body = {}) => {
    if (!validAsk(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    const { chat, id } = body;
    const key = `${chat}:${id}`;
    const done = kept.get(key);
    if (done && !done.pending) {
      return { ok: true, ...done };
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `transcribe:${key}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.TranscribeAudio({ peer, msgId: id })
          )
        )
      );
      const shape = shapeOf(answer);
      keep(key, shape);
      await env.store?.put?.(linkOf(chat, id, shape, now));
      return { ok: true, ...shape };
    });
  };

  const rateTranscription = async (body = {}) => {
    if (!validRate(body)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `transcribe-rate:${body.chat}:${body.id}`, () =>
        env.connection.withPeer(c.client, String(body.chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.RateTranscribedAudio({
              peer,
              msgId: body.id,
              transcriptionId: c.helpers.returnBigInt(
                String(body.transcriptionId)
              ),
              good: body.good,
            })
          )
        )
      );
      return { ok: true };
    });
  };

  return { transcribeAudio, rateTranscription };
};
