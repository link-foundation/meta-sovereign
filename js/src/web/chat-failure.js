/**
 * Why a message or a draft did not go out, and when it is tried again,
 * in words (the composer, the notices, the autopilot's line).
 */

// A paid chat (R-Y184): not confirmed, the price changed, no Stars.
const PAID_FAILURES = {
  'paid-declined': 'chat.paidSend.declined',
  'paid-required': 'chat.paidSend.changed',
  'paid-balance': 'chat.paid.err.balance',
  // A sign-in code the user chose not to share (R-Y218).
  'code-declined': 'chat.signInCode.declined',
};

/** Whether the failure is about a paid chat (R-Y184), told in words. */
export const isPaidFailure = (code) =>
  typeof code === 'string' && Object.hasOwn(PAID_FAILURES, code);

// Failure codes with a fixed wording; the rest need the message's fields.
const FAILURE_KEYS = {
  'write-forbidden': 'chat.failure.forbidden',
  'unknown-chat': 'chat.failure.unknownChat',
  // "Send as" refused (R-Y141).
  'send-as-invalid': 'chat.sendAs.err.send-as-invalid',
  'premium-required': 'chat.sendAs.err.premium',
  'too-long': 'chat.failure.tooLong',
  'too-large': 'chat.failure.tooLarge',
  'after-failure': 'chat.failure.afterFailure',
  network: 'chat.failure.network',
  'no-answer': 'chat.failure.network',
  // Automated sends (R-Z3).
  'paused-after-restart': 'chat.failure.pausedAfterRestart',
  'unknown-send': 'chat.failure.unknownSend',
  'too-many-failures': 'chat.failure.tooManyFailures',
  'opted-out': 'chat.failure.optedOut',
  'already-sent': 'chat.failure.alreadySent',
  'send-in-doubt': 'chat.failure.sendInDoubt',
  'outbox-unavailable': 'chat.failure.outboxUnavailable',
};

/** Why a message did not go out, in words. */
export const failureText = (t, message) => {
  if (isPaidFailure(message.code)) {
    return t(PAID_FAILURES[message.code]);
  }
  if (message.code === 'flood-wait') {
    return t('chat.failure.floodWait', { seconds: message.retryAfter ?? '?' });
  }
  if (Object.hasOwn(FAILURE_KEYS, message.code)) {
    return t(FAILURE_KEYS[message.code]);
  }
  return t('chat.failure.other', {
    error: message.error ?? message.code ?? '',
  });
};

/** A message that will be tried again by itself: why, and when. */
export const waitingText = (t, message, now = Date.now()) => {
  const seconds = Math.max(
    0,
    Math.ceil((Number(message.retryAt ?? 0) - now) / 1000)
  );
  if (message.code === 'flood-wait') {
    return t('chat.waiting.flood', { seconds });
  }
  if (globalThis.navigator?.onLine === false) {
    return t('chat.waiting.offline');
  }
  return t('chat.waiting.retry', { seconds });
};
