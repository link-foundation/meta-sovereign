import { requireSendConsent } from '../automation/send-consent.js';
import { requireDeliveryOwner } from '../automation/delivery-owner.js';

/** Bind the original target and ephemeral owner across dispatch waits. */
export const createBrowserSendConsent = (store, draft, { signal } = {}) => {
  const identity = {
    source: draft.source,
    chat: draft.chat,
    contact: draft.contact ?? draft.to,
  };
  return async () => {
    requireDeliveryOwner(signal);
    await requireSendConsent(store, identity);
    requireDeliveryOwner(signal);
  };
};

export const sendConsentOptions = (store, draft, options, dispatch) => {
  const verifyConsent = createBrowserSendConsent(store, draft, dispatch);
  return {
    ...options,
    beforeIssue: async () => {
      await options.beforeIssue?.();
      await verifyConsent();
    },
  };
};
