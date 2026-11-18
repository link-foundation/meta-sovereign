import { requireSendConsent } from '../automation/send-consent.js';

/** Bind the original target; later caller edits cannot move its consent scope. */
export const createBrowserSendConsent = (store, draft) => {
  const identity = {
    source: draft.source,
    chat: draft.chat,
    contact: draft.contact ?? draft.to,
  };
  return () => requireSendConsent(store, identity);
};
