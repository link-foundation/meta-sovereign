import { safeMessage } from '../server/redact.js';

/** Persist bounded provider errors without retaining the active credential. */
export const vkEffectError = (error, token) =>
  safeMessage(error).split(token).join('<redacted>').slice(0, 300);
