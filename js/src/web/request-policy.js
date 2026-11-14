// HTTP POST is also used for reads throughout the Telegram API. Keep their
// retry semantics explicit; changing a setting or sending is a separate action.
import { TELEGRAM_CALLS } from './dom-telegram-calls.js';

const readPosts = new Set([
  ...Object.values(TELEGRAM_CALLS)
    .filter((call) => call.read)
    .map((call) => `/api/telegram/${call.route}`),
  ...[
    'dialog-state',
    'sync',
    'history',
    'history-at',
    'dialogs',
    'forum-topics',
    'refresh',
    'search-peers',
    'search-global',
    'search',
    'shared-counts',
    'shared-media',
  ].map((route) => `/api/telegram/${route}`),
  '/api/vk/history',
  '/api/contacts/import/preview',
  '/api/auto-import/telegram/scan',
  '/api/cv/read',
  '/api/cv/compare',
  '/api/automations/plan',
  '/api/audiences/resolve',
  '/api/greetings/stickers',
  '/api/feedback/collect',
  '/api/broadcast/test',
  '/api/broadcast/preview',
]);
// These provider reads own an explicit finite retry budget and cancellation.
// Connection recovery must return their exhausted timeout to the caller.
const boundedProviderReads = new Set([
  '/api/forms/read',
  '/api/forms/plan',
  '/api/forms/sessions/open',
  '/api/forms/sessions/read',
  '/api/forms/sessions/focus',
  '/api/forms/sessions/close',
  '/api/forms/sessions/plan',
  '/api/forms/sessions/apply',
  '/api/forms/sessions/disclose',
  '/api/automations/follow/chats',
  '/api/automations/follow/details',
  '/api/automations/follow/telegram',
]);
export const isReadRequest = (path, method = 'GET') => {
  if (boundedProviderReads.has(new URL(path, 'http://local').pathname)) {
    return false;
  }
  if (['GET', 'HEAD'].includes(method.toUpperCase())) {
    return true;
  }
  return (
    method.toUpperCase() === 'POST' &&
    readPosts.has(new URL(path, 'http://local').pathname)
  );
};
export const isConnectionFailure = (code) =>
  [
    'network',
    'no-answer',
    'no-connection',
    'timeout',
    'server-starting',
    'reconnecting',
    'telegram-reconnect',
    'telegram-stuck',
  ].includes(code);

export const retryableReadResponse = async (response) => {
  if (
    !response ||
    response.ok ||
    !(response.status >= 500) ||
    [501, 505].includes(response.status)
  ) {
    return false;
  }
  const data = await response
    .clone?.()
    .json()
    .catch(() => null);
  // Reverse proxies can return HTML during a restart. A provider refusal
  // keeps its explicit code and is handled by the panel that requested it.
  return (
    !data?.code || isConnectionFailure(data.code) || data.code === 'internal'
  );
};

export const retryableReadData = (data) =>
  Boolean(
    (data?.error || data?.ok === false || data?.status === 'failed') &&
    isConnectionFailure(data?.code)
  );
