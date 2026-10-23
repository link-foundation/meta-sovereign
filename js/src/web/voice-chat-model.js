// What a voice chat looks like in the page (R-Y188; learned, never
// copied): the bar's state, the call merged from what the chat said when
// it opened and what Telegram's updates say since, and the participant
// marks. Pure: no React, so tests import it alone.

/** The link the server keeps for a chat's call (updateGroupCall). */
export const callLinkOf = (links, chat) =>
  chat?.source === 'telegram' && Array.isArray(links)
    ? (links.find((l) => l?.id === `groupcall:telegram:${chat.chat}`) ?? null)
    : null;

/**
 * The call to show: what was asked when the chat opened (`asked`:
 * `{ call, at }`) unless the live link is newer, which then wins (its
 * `call` null: the call is over). The live call lacks the open-time extras
 * (`recent`, `defaultJoinAs`), which are kept while it is the same call.
 */
export const mergedCall = (asked, live) => {
  const askedCall = asked?.call ?? null;
  if (!live) {
    return askedCall;
  }
  const newer = Date.parse(live.at) >= (asked?.at ?? 0) || !asked;
  if (!newer) {
    return askedCall;
  }
  if (!live.call) {
    return null;
  }
  return askedCall && askedCall.id === live.call.id
    ? { ...askedCall, ...live.call }
    : live.call;
};

/** Whether the call is scheduled and has not started. */
export const isScheduled = (call, nowMs) =>
  Boolean(call?.scheduleDate) && call.scheduleDate * 1000 > nowMs;

/** The locale key of the bar's heading. */
export const kindKey = (call) =>
  call?.live ? 'chat.voice.live' : 'chat.voice.title';

// An `active_date` this many seconds old still counts as speaking.
const SPEAKING_SECONDS = 5;

/** Whether a participant spoke a moment ago (and is not muted). */
export const isSpeaking = (p, nowMs) =>
  !p.muted &&
  Number(p.activeDate) > 0 &&
  nowMs / 1000 - Number(p.activeDate) <= SPEAKING_SECONDS;

/** The marks to show on a participant, in order. */
export const marksOf = (p, nowMs) =>
  [
    isSpeaking(p, nowMs) && 'speaking',
    p.raisedHand && 'hand',
    p.video && 'video',
    p.presentation && 'presentation',
    p.muted && 'muted',
  ].filter(Boolean);

/** Participants in the order Telegram Desktop lists them: speakers, the unmuted, the hands, the rest. */
export const sortedParticipants = (list, nowMs) => {
  const rank = (p) =>
    isSpeaking(p, nowMs) ? 0 : !p.muted ? 1 : p.raisedHand ? 2 : 3;
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || (a.date ?? 0) - (b.date ?? 0)
  );
};

/** Merge a further page into the list (by id; later pages never repeat). */
export const mergedPages = (list, more) => {
  const seen = new Set(list.map((p) => p.id));
  return [...list, ...more.filter((p) => !seen.has(p.id))];
};

/**
 * Whether we may unmute ourselves: Telegram says so on our own
 * participant (`canSelfUnmute`); before it has, a call that does not
 * join people muted allows it.
 */
export const mayUnmute = (me, call) =>
  me ? Boolean(me.canSelfUnmute) : !call?.joinMuted;
