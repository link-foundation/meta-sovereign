// What a private call looks like in the page (R-Y196; learned, never
// copied): which link is the call, whether it is shown, the words of its
// state and who may be called. Pure: no React, so tests import it alone.
// The key never reaches the page, only the emoji made from it.

import { formatCallDuration } from './call-model.js';

export const LINK_ID = 'phonecall:telegram';

// A ringing or ended call this old is a leftover, not shown.
export const FRESH_MS = 2 * 60_000;

/** The call's link among the page's links, or null. */
export const callLinkOf = (links) =>
  Array.isArray(links) ? (links.find((l) => l?.id === LINK_ID) ?? null) : null;

/**
 * The call to show now, or null. `dismissed` is the set of call keys the
 * user closed. An incoming call that ended unanswered is not shown (the
 * notification just goes); an outgoing one that ended says why.
 */
export const shownCall = (
  link,
  { dismissed = new Set(), now = Date.now() } = {}
) => {
  if (!link || dismissed.has(link.ref)) {
    return null;
  }
  const age = now - Date.parse(link.at);
  if (link.phase === 'incoming') {
    return age <= FRESH_MS ? link : null;
  }
  if (link.phase === 'ended') {
    const worth = link.connected || link.out;
    return worth && age <= FRESH_MS ? link : null;
  }
  return link;
};

/** Whether the call is one that has not ended. */
export const isLive = (call) => Boolean(call) && call.phase !== 'ended';

/** Seconds since the call became active. */
export const elapsedSeconds = (call, now = Date.now()) =>
  call?.startedAt ? Math.max(0, Math.floor((now - call.startedAt) / 1000)) : 0;

/** "0:07" (a call's running time; zero shows as 0:00). */
export const timerText = (seconds) => formatCallDuration(seconds) || '0:00';

/** The locale key of the line that says where the call is. */
export const statusKey = (call) => {
  switch (call.phase) {
    case 'incoming':
      return 'chat.call.incoming';
    case 'waiting':
      return 'chat.call.waiting';
    case 'ringing':
      return 'chat.call.ringing';
    case 'connecting':
      return 'chat.call.connecting';
    case 'active':
      return 'chat.call.active';
    default:
      return `chat.call.end.${call.reason ?? 'hangup'}`;
  }
};

const FAILURES = new Set([
  'privacy',
  'blocked',
  'outdated',
  'busy',
  'gone',
  'flood',
  'no-access',
  'dh',
  'dh-hash',
  'dh-config',
  'fingerprint',
  'restart',
]);

/** The locale key of why a call or a start failed. */
export const failureKey = (code) =>
  `chat.call.err.${FAILURES.has(code) ? code : 'failed'}`;

/** Whether a call may be placed from the open chat. */
export const canCall = (chat, info, call) =>
  chat?.source === 'telegram' &&
  chat.personal === true &&
  /^\d+$/.test(String(chat.chat)) &&
  info?.kind === 'user' &&
  !info.bot &&
  !isLive(call);

/** The ring timeout of an outgoing call that has not been answered. */
export const ringsOut = (call) =>
  Boolean(call?.out) && (call.phase === 'waiting' || call.phase === 'ringing');

/** The reasons for which an ended call is a failure to show as an error. */
export const endedText = (call) =>
  call.reason === 'failed' ? failureKey(call.code) : statusKey(call);
