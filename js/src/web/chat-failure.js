/**
 * Why a message or a draft did not go out, and when it is tried again,
 * in words (the composer, the notices, the autopilot's line).
 */

/** Why a message did not go out, in words. */
export const failureText = (t, message) => {
  switch (message.code) {
    case 'flood-wait':
      return t('chat.failure.floodWait', {
        seconds: message.retryAfter ?? '?',
      });
    case 'write-forbidden':
      return t('chat.failure.forbidden');
    case 'unknown-chat':
      return t('chat.failure.unknownChat');
    // "Send as" refused (R-Y141).
    case 'send-as-invalid':
      return t('chat.sendAs.err.send-as-invalid');
    case 'premium-required':
      return t('chat.sendAs.err.premium');
    case 'too-long':
      return t('chat.failure.tooLong');
    case 'too-large':
      return t('chat.failure.tooLarge');
    case 'after-failure':
      return t('chat.failure.afterFailure');
    case 'network':
    case 'no-answer':
      return t('chat.failure.network');
    default:
      return t('chat.failure.other', {
        error: message.error ?? message.code ?? '',
      });
  }
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
