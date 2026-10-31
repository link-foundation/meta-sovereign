import { api } from './dom.js';
import { useFeedbackRead } from './feedback-read.js';

// Secrets intentionally stay on the server. A missing secret in browser storage
// says nothing about the server's configured account or active connection.
export const telegramConnectionState = (status) => {
  if (!status) {
    return null;
  }
  if (status.connected) {
    return 'connected';
  }
  if (status.needsLogin) {
    return 'action-required';
  }
  if (status.account || status.kind === 'user' || status.reconnecting) {
    return 'reconnecting';
  }
  return null;
};
export const useProviderLiveState = () =>
  useFeedbackRead(() => api.telegramStatus(), 'provider-live-state').data;
