import { safeMessage } from '../server/redact.js';
import { loadSettings, optOutEntry } from './safety.js';

const refusal = (code, message) =>
  Object.assign(new Error(message), { code, fallback: false });

export const isSendConsentRefusal = (error) =>
  ['opted-out', 'safety-settings-unavailable'].includes(error?.code);

/** Read acknowledged consent after a wait, before entering another transport. */
export const requireSendConsent = async (store, draft) => {
  let settings;
  try {
    settings = await loadSettings(store);
  } catch (error) {
    throw refusal(
      'safety-settings-unavailable',
      `not sent: ${safeMessage(error)}`
    );
  }
  if (optOutEntry(settings, draft)) {
    throw refusal('opted-out', 'this chat is on the opt-out list');
  }
};
