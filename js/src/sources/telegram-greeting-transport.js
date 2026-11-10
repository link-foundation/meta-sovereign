import { connect } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import {
  greetingFailure,
  resolveGreetingTarget,
  greetingInputMatches,
} from './telegram-greeting-target.js';
import { randomIdOf } from './telegram-send.js';
import { messageReceipt } from './telegram-message-receipt.js';

// This check is inside the last transport callback, after any reconnect/file
// reference renewal. The selector may have been reassigned since the preview.
const verifiedPeer = async (env, context, c, plan, stopped) => {
  if (stopped()) {
    throw greetingFailure(stopped());
  }
  if ((await greetingStickerOwner(env, c)) !== plan.owner) {
    throw greetingFailure('account-changed');
  }
  const { entity, target } = await resolveGreetingTarget(
    c,
    plan.selector,
    plan.operation
  );
  if (target.chat !== plan.target.chat || target.kind !== plan.target.kind) {
    throw greetingFailure('target-changed');
  }
  const peer = await c.client.getInputEntity(entity);
  if (!greetingInputMatches(peer, target)) {
    throw greetingFailure('target-changed');
  }
  if (stopped() || (await greetingStickerOwner(env, c)) !== plan.owner) {
    throw greetingFailure(stopped() || 'account-changed');
  }
  if ((await context.userClient()) !== c.client || stopped()) {
    throw greetingFailure(stopped() || 'account-changed');
  }
  return peer;
};
const checkedPeer = async (...args) => {
  try {
    return await verifiedPeer(...args);
  } catch (error) {
    // All of these reads precede the write. A failed read is a definite
    // non-send, even when it was a network timeout.
    const known = [
      'account-changed',
      'target-changed',
      'user-account-required',
      'bot-required',
      'target-unavailable',
      'stopped',
      'cancelled',
    ];
    throw greetingFailure(
      known.includes(error.code) ? error.code : 'read-failed'
    );
  }
};
const botStart = async (env, context, plan, draft, stopped) => {
  const c = await connect(env, context.userClient);
  if (!c) {
    throw greetingFailure('user-account-required');
  }
  const peer = await checkedPeer(env, context, c, plan, stopped);
  const request = new c.Api.messages.SendMessage({
    peer,
    message: '/start',
    randomId: randomIdOf(draft.clientId, 0, c.helpers),
    clearDraft: false,
  });
  let answer;
  try {
    answer = await c.client.invoke(request);
  } catch (error) {
    // A transport exception may follow an accepted write. Only Telegram's
    // explicit RPC refusal is definite; never leak its contextual message.
    throw Object.assign(new Error('Telegram response unavailable'), {
      code:
        error.errorMessage?.match(/^[A-Z_0-9]{1,80}$/)?.[0] ?? 'send-unknown',
      ambiguous: !error.errorMessage,
    });
  }
  const messageId = messageReceipt(answer, request);
  await context.apply(c.client, answer).catch(() => {
    env.log?.({ level: 'debug', event: 'telegram_sent_projection_failed' });
  });
  return { ok: true, messageId, via: 'telegram' };
};
export const sendGreeting = async (env, context, plan, draft, stopped) => {
  if (plan.operation === 'bot-start') {
    return botStart(env, context, plan, draft, stopped);
  }
  try {
    const result = await context.sendDocument(
      { ...draft, chat: plan.target.chat, id: plan.sticker.id },
      (c) => checkedPeer(env, context, c, plan, stopped)
    );
    if (result?.ok === false) {
      throw greetingFailure(result.code ?? 'user-account-required');
    }
    return result;
  } catch (error) {
    if (
      !['account-changed', 'target-changed', 'stopped', 'cancelled'].includes(
        error.code
      )
    ) {
      // sendDocument maps RPC errors for the composer. Unrecognised failures
      // remain conservative here, since their request may have left.
      const definite = new Set([
        'flood-wait',
        'unknown-chat',
        'forbidden',
        'write-forbidden',
        'paid-required',
        'user-account-required',
        'bot-required',
        'target-unavailable',
        'unknown-sticker',
        'read-failed',
      ]);
      if (!definite.has(error.code)) {
        error.ambiguous = true;
      }
    }
    error.message = 'Telegram greeting response unavailable';
    throw error;
  }
};
